// panel-strategy.js
//
// Entry point. Registers `custom:panel-strategy` as a Home Assistant
// dashboard strategy (`ll-strategy-panel-strategy` — HA looks up
// `ll-strategy-<type>` for a `strategy: {type: custom:<type>}` config).
//
// Forwards this file's own `?v=` query string into every submodule import,
// same as bonbon-strategy.js's `?hacstag=` — without it, editing a
// submodule doesn't reliably show up for a browser that already cached it
// under the old import URL. Bump `?v=` on the resource registration
// (Settings > Dashboards > Resources) whenever any file in this folder
// changes.
const v = new URL(import.meta.url).searchParams.get('v') || '';
const suffix = v ? `?v=${v}` : '';

// HA's strategy loader races customElements.whenDefined(tag) against a
// hard 5s timeout and gives up permanently (no retry) if the element isn't
// registered in time. On a cold load, with ~20 other custom card resources
// also loading, awaiting all submodule imports before calling
// customElements.define() risked losing that race even though generate()
// itself always completed fine once actually called.
//
// Fix: define the element synchronously, immediately. Submodules load
// lazily on the first generate() call instead (and are cached after) —
// there's no equivalent timeout on generate() itself.
let modulesPromise;
function loadModules() {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      import(`./panel-strategy-utils.js${suffix}`),
      import(`./panel-strategy-builders.js${suffix}`),
      import(`./panel-strategy-config.js${suffix}`),
      import(`./panel-strategy-views.js${suffix}`),
    ]).then(([utils, builders, configMod, viewsMod]) => ({
      utils,
      builders,
      defaultConfig: configMod.defaultConfig,
      buildHomeView: viewsMod.buildHomeView,
      buildRoomView: viewsMod.buildRoomView,
      buildDevicesView: viewsMod.buildDevicesView,
      buildDeviceCategoryView: viewsMod.buildDeviceCategoryView,
      buildCamerasView: viewsMod.buildCamerasView,
      buildExtraView: viewsMod.buildExtraView,
    }));
  }
  return modulesPromise;
}

// hass.areas/devices/entities/floors load in asynchronously after the
// initial connection — generate() can run once before they're populated,
// silently producing an empty dashboard. Wait briefly for hass.areas to
// have entries before building anything.
async function waitForAreas(hass, timeoutMs = 4000, intervalMs = 150) {
  const start = Date.now();
  while (Object.keys(hass.areas || {}).length === 0 && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  if (Object.keys(hass.areas || {}).length === 0) {
    console.warn(`panel-strategy: hass.areas still empty after ${timeoutMs}ms — rendering with whatever this hass snapshot has.`);
  }
}

function errorView(title, error) {
  return {
    views: [
      {
        title: 'panel-strategy error',
        cards: [
          {
            type: 'markdown',
            content: `**${title}**\n\n> ${error.message}\n\n\`\`\`\n${error.stack}\n\`\`\``,
          },
        ],
      },
    ],
  };
}

console.log('panel-strategy: module evaluated, registering element now');

export class PanelStrategy {
  static async generate(userConfig, hass) {
    console.log('panel-strategy: generate() called');
    let mods;
    try {
      mods = await loadModules();
    } catch (e) {
      console.error('panel-strategy: failed to load submodules', e);
      return errorView('panel-strategy failed to load its own submodules', e);
    }
    try {
      await waitForAreas(hass);
      const config = mods.utils.mergeDeep(mods.defaultConfig, userConfig || {});
      // Computed once so the Home view's room-card list and the generated
      // room subviews can't silently drift apart.
      const roomAreas = mods.utils.visibleAreasByFloor(
        hass,
        config.areas?.hidden_labels || ['hidden'],
        config.areas?.order || []
      );
      const homeView = mods.buildHomeView(config, hass, mods.builders, mods.utils, roomAreas);
      const roomViews = roomAreas.map((area) => mods.buildRoomView(area, config, hass, mods.builders, mods.utils));

      // Every non-excluded camera.* entity, auto-discovered like the rest
      // of the strategy. Computed before deviceViews since the devices
      // picker needs to know whether to show a "Kameras" tile.
      const cameraEntityIds = Object.keys(hass.states)
        .filter((entityId) => entityId.startsWith('camera.'))
        .filter((entityId) => !mods.utils.isAutoExcluded(hass, entityId))
        .sort((a, b) => {
          const na = hass.states[a]?.attributes?.friendly_name || a;
          const nb = hass.states[b]?.attributes?.friendly_name || b;
          return na.localeCompare(nb);
        });
      const camerasViews = cameraEntityIds.length
        ? [mods.buildCamerasView(config, hass, mods.builders, mods.utils, cameraEntityIds)]
        : [];

      const categories = config.device_categories || [];
      let deviceViews = [];
      if (categories.length) {
        // Not scoped to roomAreas here — which areas a device page
        // actually displays is auto-area-device-card.js's own job (its
        // require_floor/hidden_labels options). Scoping it here too would
        // just be a second, redundant place doing the same filtering.
        const allAreaIds = new Set(Object.keys(hass.areas || {}));
        const byCategory = mods.utils.assignEntitiesToCategories(hass, categories, allAreaIds);
        deviceViews = [
          mods.buildDevicesView(config, hass, mods.builders, mods.utils, cameraEntityIds.length > 0),
          ...categories.map((category) =>
            mods.buildDeviceCategoryView(category, byCategory.get(category), config, hass, mods.builders, mods.utils)
          ),
        ];
      }

      // Fully hand-authored extra views (see buildExtraView's comment) —
      // e.g. a household-specific power dashboard.
      const extraViews = (config.views?.extra || []).map((viewConfig) =>
        mods.buildExtraView(viewConfig, config, hass, mods.builders, mods.utils)
      );

      console.log('panel-strategy: generate() succeeded', {
        type: homeView.type,
        roomViews: roomViews.length,
        deviceViews: deviceViews.length,
        camerasViews: camerasViews.length,
        extraViews: extraViews.length,
      });
      return { views: [homeView, ...roomViews, ...deviceViews, ...camerasViews, ...extraViews] };
    } catch (e) {
      console.error('panel-strategy: generate() threw', e);
      return errorView('panel-strategy failed to generate the dashboard', e);
    }
  }
}

customElements.get('ll-strategy-panel-strategy') || customElements.define('ll-strategy-panel-strategy', PanelStrategy);
