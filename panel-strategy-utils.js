// panel-strategy-utils.js
//
// Shared helpers: config merging, entity/area lookups, and the filter-
// matching logic also used (as its own copy) by auto-area-device-card.js.

export function mergeDeep(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) {
    return override !== undefined ? override : base;
  }
  if (typeof base !== 'object' || base === null || typeof override !== 'object' || override === null) {
    return override !== undefined ? override : base;
  }
  const out = { ...base };
  for (const key of Object.keys(override)) {
    out[key] = mergeDeep(base[key], override[key]);
  }
  return out;
}

// filter: {domain?, domains?, exclude_domains?, device_class?,
// device_classes?, exclude_device_classes?, exclude_platforms?}. The plural
// forms match "any of these". exclude_platforms reads the entity registry's
// `platform` (e.g. 'template', 'threshold') to tell a real hardware sensor
// apart from a computed/helper one.
export function matchesFilter(entityId, attrs, filter, hass) {
  const domain = entityId.slice(0, entityId.indexOf('.'));
  if (filter.domain && filter.domain !== domain) return false;
  if (filter.domains && !filter.domains.includes(domain)) return false;
  if (filter.exclude_domains && filter.exclude_domains.includes(domain)) return false;
  if (filter.device_class && attrs?.device_class !== filter.device_class) return false;
  if (filter.device_classes && !filter.device_classes.includes(attrs?.device_class)) return false;
  if (filter.exclude_device_classes && filter.exclude_device_classes.includes(attrs?.device_class)) return false;
  if (filter.exclude_platforms && filter.exclude_platforms.includes(hass?.entities?.[entityId]?.platform)) return false;
  return true;
}

// Entities that never show up anywhere the strategy auto-generates content:
// event/notify domains, browser_mod/zigbee2mqtt bridge entities, config/
// diagnostic entities, helper groups, hidden/disabled entities.
export function isAutoExcluded(hass, entityId) {
  const domain = entityId.slice(0, entityId.indexOf('.'));
  if (domain === 'event' || domain === 'notify') return true;
  if (entityId.includes('browser_mod') || entityId.includes('zigbee2mqtt_bridge')) return true;
  const reg = hass.entities?.[entityId];
  if (reg) {
    if (reg.entity_category) return true;
    if (reg.platform === 'group') return true;
    if (reg.hidden_by || reg.disabled_by) return true;
  }
  return false;
}

export function entityArea(hass, entityId) {
  const reg = hass.entities?.[entityId];
  if (!reg) return null;
  if (reg.area_id) return reg.area_id;
  const device = reg.device_id ? hass.devices?.[reg.device_id] : null;
  return device?.area_id || null;
}

function visibleAreas(hass, hiddenLabels) {
  return Object.values(hass.areas || {})
    .filter((a) => !a.labels?.some((l) => hiddenLabels.includes(l)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Areas eligible to appear as "rooms": not hidden, and assigned to a floor
// (areas with no floor — network closets, admin/technical groupings — are
// dropped rather than needing a separate hidden-label).
// `order`: explicit area_ids shown first in that order; anything else falls
// back to floor level, then name.
export function visibleAreasByFloor(hass, hiddenLabels, order = []) {
  const floors = hass.floors || {};
  const orderIndex = new Map(order.map((id, i) => [id, i]));
  return visibleAreas(hass, hiddenLabels)
    .filter((a) => a.floor_id && floors[a.floor_id])
    .sort((a, b) => {
      const ia = orderIndex.has(a.area_id) ? orderIndex.get(a.area_id) : Infinity;
      const ib = orderIndex.has(b.area_id) ? orderIndex.get(b.area_id) : Infinity;
      if (ia !== ib) return ia - ib;
      const levelDiff = (floors[a.floor_id].level ?? 0) - (floors[b.floor_id].level ?? 0);
      if (levelDiff !== 0) return levelDiff;
      return a.name.localeCompare(b.name);
    });
}

// Assigns every entity in areaIds to the first category (in list order)
// whose filter matches it, so a broad catch-all category only picks up
// what no earlier, more specific category already claimed. Used both for a
// single room (buildRoomView) and for the device pages, area-wide
// (panel-strategy.js) — computing it once here is what keeps those two
// views in agreement.
//
// Returns a Map<category, entityId[]>, each array sorted by friendly name.
export function assignEntitiesToCategories(hass, categories, areaIds) {
  const byCategory = new Map(categories.map((c) => [c, []]));
  for (const entityId in hass.states) {
    if (isAutoExcluded(hass, entityId)) continue;
    const areaId = entityArea(hass, entityId);
    if (!areaId || !areaIds.has(areaId)) continue;
    const attrs = hass.states[entityId].attributes;
    const category = categories.find((c) => matchesFilter(entityId, attrs, c, hass));
    if (!category) continue;
    byCategory.get(category).push(entityId);
  }
  for (const entityIds of byCategory.values()) {
    entityIds.sort((a, b) => {
      const na = hass.states[a]?.attributes?.friendly_name || a;
      const nb = hass.states[b]?.attributes?.friendly_name || b;
      return na.localeCompare(nb);
    });
  }
  return byCategory;
}

// Paths of any views.extra entries that opted into the auto back-button
// (back_button: true) — by default that button only appears on room/
// devices/kameras pages, not on custom extra views.
export function backButtonExtraPaths(config) {
  return (config.views?.extra || []).filter((v) => v.back_button).map((v) => v.path);
}

// Should a generated view be marked `subview: true` (hidden from HA's own
// top view-tab strip)? Only relevant once a navbar is configured. Rooms/
// devices pages/back_button-opted extras (drillDown) are always hidden —
// one tab per room or category is just clutter. Top-level views (Home,
// Kameras, plain extras) follow config.hide_native_tabs instead (default
// true), so they can be shown alongside the custom navbar if wanted.
export function isHiddenFromNativeTabs(config, drillDown) {
  if (!config.navbar) return false;
  return drillDown || config.hide_native_tabs !== false;
}
