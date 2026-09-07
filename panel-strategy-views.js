// panel-strategy-views.js
//
// View assembly. buildHomeView: the Home view (weather + devices button +
// doors + persons + room cards). buildRoomView: one subview per area,
// grouping that area's entities by device_categories. buildDevicesView:
// the picker the Home view's "Geräte" button links to.
// buildDeviceCategoryView: one view per category, listing every matching
// entity across all areas. buildCamerasView: the Kameras tab.
// buildExtraView: wraps a hand-authored view from config.views.extra.
//
// The Home view uses native horizontal-stack/vertical-stack/grid rather
// than custom:layout-card — layout-card's layout types share masonry-
// layout's column-balancing base class, which doesn't reliably reserve
// height for a short column next to a tall one. Plain flexbox rows/
// columns avoid that entirely.
//
// Takes `builders`/`utils` as parameters instead of importing them
// directly: a static import can't carry the cache-busting query string the
// entry point forwards to every module (see panel-strategy.js).

export function buildHomeView(config, hass, builders, utils, roomAreas) {
  const layout = config.layout || {};
  const personCards = (config.persons || []).map((person) =>
    builders.buildPersonCard(person, hass, layout.button_height ?? 90, config.person_away_dimming ?? true)
  );

  // Weather, "Geräte" and the door cards all share one height so they line
  // up as one visual block without any per-card height overrides.
  const buttonHeight = layout.button_height ?? 90;
  const devicesCard = config.device_categories?.length
    ? builders.buildDevicesButtonCard(`/${hass.panelUrl}/devices`, buttonHeight)
    : null;
  const weatherCard = config.weather_entity
    ? {
        type: 'weather-forecast',
        entity: config.weather_entity,
        forecast_type: config.weather_forecast_type ?? 'daily',
        show_current: true,
        show_forecast: config.weather_show_forecast ?? false,
        ...(config.weather_name ? { name: config.weather_name } : {}),
        ...(config.weather_secondary_info_attribute
          ? { secondary_info_attribute: config.weather_secondary_info_attribute }
          : {}),
        // !important needed — otherwise loses to weather-forecast's own
        // internal height handling.
        card_mod: { style: `ha-card { height: ${buttonHeight}px !important; overflow: hidden; }` },
      }
    : null;

  // Each door is up to two cards (lock + sensor); flattened into one list
  // rather than kept as fixed "front"/"back" slots, so any number of doors
  // works. Rendered as a 3-column grid below, wrapping to further rows of
  // 3 if there are more than 3 cards in total.
  const doorCards = (config.doors || [])
    .flatMap((door) => [
      door.lock_entity ? builders.buildSecurityCard(door.lock_entity, buttonHeight, door.lock_name, door.lock_icon) : null,
      door.sensor_entity ? builders.buildSecurityCard(door.sensor_entity, buttonHeight, door.sensor_name, door.sensor_icon) : null,
    ])
    .filter(Boolean);

  // buildRoomCard needs the literal row height too (see roomCardStyles in
  // panel-strategy-builders.js), so it's computed here rather than left to
  // CSS grid stretch.
  const roomCardHeight = layout.room_card_height ?? 150;
  const roomGridGap = layout.room_grid_gap ?? 18;
  const ROOM_CARD_PADDING_BOTTOM = 15;

  // roomAreas is computed once by the caller (panel-strategy.js) and
  // passed in, since it's also needed there for the room subviews — one
  // shared list keeps both in sync.
  const roomCards = roomAreas.map((area) =>
    builders.buildRoomCard(area, `/${hass.panelUrl}/room_${area.area_id}`, roomCardHeight, ROOM_CARD_PADDING_BOTTOM)
  );

  const headingCard = config.home_heading ? builders.buildHeadingCard(config.home_heading) : null;

  // Native grid's row/column gap and vertical-stack's child gap don't
  // share the same effective default in this HA install, so both are
  // pinned to the same literal value instead of relying on them matching.
  const blockGap = layout.block_gap ?? 12;
  const leftColumn =
    headingCard || personCards.length
      ? {
          type: 'vertical-stack',
          cards: [
            headingCard,
            personCards.length
              ? {
                  type: 'grid',
                  columns: 2,
                  square: false,
                  cards: personCards,
                  card_mod: { style: `:host { --grid-card-gap: ${blockGap}px; }` },
                }
              : null,
          ].filter(Boolean),
          card_mod: { style: `:host { --vertical-stack-card-gap: ${blockGap}px; }` },
        }
      : null;

  // Right column: weather + "Geräte" on top, door cards below, as two
  // separate grids in a vertical-stack so each row sizes off only its own
  // cards.
  //
  // Both grids share the same 3-column 1fr/1fr/1fr template and gap,
  // weather spanning 2 of the 3 via grid-column — a plain "2fr 1fr"
  // 2-column template doesn't line up with a 3-column row below it once
  // the gap is nonzero (a different number of gaps gets subtracted on
  // each side before the fr split).
  const topPairCards = [weatherCard, devicesCard].filter(Boolean);
  const topPair = topPairCards.length
    ? {
        type: 'grid',
        columns: 3,
        square: false,
        cards: topPairCards,
        card_mod: {
          style: `
            ${topPairCards.length === 2 ? '#root > *:first-child { grid-column: span 2 !important; }' : ''}
            :host { --grid-card-gap: ${blockGap}px; }
          `,
        },
      }
    : null;
  const doorsRow = doorCards.length
    ? {
        type: 'grid',
        columns: 3,
        square: false,
        cards: doorCards,
        card_mod: { style: `:host { --grid-card-gap: ${blockGap}px; }` },
      }
    : null;

  // A gap-card the height of the "Home" heading, so the right column's
  // content starts level with the person-card grid on the left (which
  // sits below that heading).
  const HOME_HEADING_HEIGHT = 84;
  const rightColumnGap =
    config.home_heading && (topPair || doorsRow)
      ? { type: 'custom:gap-card', height: HOME_HEADING_HEIGHT }
      : null;

  const rightColumn =
    topPair || doorsRow
      ? {
          type: 'vertical-stack',
          cards: [rightColumnGap, topPair, doorsRow].filter(Boolean),
          card_mod: { style: `:host { --vertical-stack-card-gap: ${blockGap}px; }` },
        }
      : null;

  const topRow =
    leftColumn || rightColumn
      ? {
          type: 'horizontal-stack',
          cards: [leftColumn, rightColumn].filter(Boolean),
          card_mod: { style: ':host { --horizontal-stack-card-gap: 48px; }' },
        }
      : null;

  // One grid holding every room card, grid-auto-flow: column so extra
  // rooms page off-screen (horizontal scroll/swipe) instead of growing
  // the view's height.
  //
  // Row count can't be left to CSS auto-fill — hui-grid-card sets its own
  // inline height, which wins over any stylesheet — so it's computed here
  // from window.innerHeight at generate() time instead (fixed until the
  // next reload).
  const roomColumns = config.room_columns || 3;
  // Subtracts the fixed-height chrome above the room grid (app bar,
  // heading, top row, gap) from window.innerHeight — deliberately
  // generous, since one row too few beats overflowing the screen.
  // Override via layout.reserved_height if this estimate is off for you.
  const fixedChromeHeight = layout.reserved_height ?? 420;
  const roomAreaHeight = typeof window !== 'undefined' ? Math.max(roomCardHeight, window.innerHeight - fixedChromeHeight) : 420;
  // A row's real footprint includes each card's own padding-bottom (see
  // roomCardStyles), not just roomCardHeight.
  const roomRowFootprint = roomCardHeight + ROOM_CARD_PADDING_BOTTOM + roomGridGap;
  const roomRows = Math.max(1, Math.floor((roomAreaHeight + roomGridGap) / roomRowFootprint));
  const roomsSection = roomCards.length
    ? {
        type: 'grid',
        columns: roomColumns,
        square: false,
        cards: roomCards,
        card_mod: {
          style: `
            #root {
              display: grid !important;
              grid-auto-flow: column !important;
              grid-template-columns: none !important;
              grid-auto-columns: calc((100% - ${(roomColumns - 1) * roomGridGap}px) / ${roomColumns}) !important;
              grid-template-rows: repeat(${roomRows}, minmax(${roomCardHeight + ROOM_CARD_PADDING_BOTTOM}px, 1fr)) !important;
              align-items: stretch !important;
              gap: ${roomGridGap}px !important;
              height: ${roomRows * (roomCardHeight + ROOM_CARD_PADDING_BOTTOM) + (roomRows - 1) * roomGridGap}px !important;
              overflow-x: auto !important;
              overflow-y: hidden !important;
              scroll-snap-type: x mandatory !important;
              padding: 0 !important;
              margin: 0 !important;
              border: none !important;
              box-shadow: none !important;
              background: none !important;
            }
          `,
        },
      }
    : null;

  // vertical-stack (not two separate top-level cards) so the sections
  // view's own masonry-style column balancing can't place topRow and
  // roomsSection side by side instead of stacked.
  // layout_options.grid_columns: 'full' is what actually makes a card
  // claim the section's full width (column_span on the section alone
  // doesn't).
  const topToRoomsGap = topRow && roomsSection ? { type: 'custom:gap-card', height: 40 } : null;

  const body = topRow || roomsSection
    ? {
        type: 'vertical-stack',
        cards: [topRow, topToRoomsGap, roomsSection].filter(Boolean),
        layout_options: { grid_columns: 'full' },
      }
    : null;

  const cards = [body].filter(Boolean);

  // Escape hatch for anything not covered by the fixed structure above
  // (e.g. a vacuum nav button) — plain passthrough cards.
  for (const section of config.views?.home?.sections || []) {
    if (section.type === 'cards' && section.cards?.length) {
      cards.push({ type: 'vertical-stack', cards: section.cards });
    }
  }

  if (config.navbar) cards.push(builders.buildNavbarCard(config.navbar, utils.backButtonExtraPaths(config)));

  return {
    title: config.home_heading,
    path: 'home',
    icon: 'mdi:home',
    // Native `sections` view, not masonry-layout/layout-card — layout-card
    // hits an open upstream bug with several nested custom cards
    // (thomasloven/lovelace-layout-card#252), and native `masonry` gives
    // navbar-card its own column, squeezing everything else. `sections`
    // has neither problem.
    type: 'sections',
    max_columns: 4,
    ...(config.theme ? { theme: config.theme } : {}),
    // See isHiddenFromNativeTabs (panel-strategy-utils.js) / config.hide_native_tabs.
    ...(utils.isHiddenFromNativeTabs(config, false) ? { subview: true } : {}),
    sections: [{ type: 'grid', column_span: 4, cards }],
  };
}

// One subview per area, linked from that area's Home room card. Groups the
// area's entities under each device_categories entry via
// assignEntitiesToCategories (first-match-wins — see panel-strategy-utils.js),
// skipping categories with nothing to show in this area. Can scroll, unlike
// the Home view's room grid.
export function buildRoomView(area, config, hass, builders, utils) {
  const layout = config.layout || {};
  const buttonHeight = layout.button_height ?? 90;
  const categoryColumns = layout.room_category_columns ?? 3;
  const categories = config.device_categories || [];
  const byCategory = utils.assignEntitiesToCategories(hass, categories, new Set([area.area_id]));

  const groups = [];
  for (const category of categories) {
    const entityIds = byCategory.get(category);
    if (!entityIds.length) continue;
    const deviceCards = entityIds.map((entityId) => {
      // Same default as auto-area-device-card.js: light/switch default to
      // a toggling 'switch' button, everything else to 'state'.
      const domain = entityId.slice(0, entityId.indexOf('.'));
      const buttonType = category.button_type || (domain === 'light' || domain === 'switch' ? 'switch' : 'state');
      return builders.buildDeviceCard(entityId, buttonType, buttonHeight);
    });
    groups.push({
      type: 'vertical-stack',
      cards: [
        builders.buildSectionHeadingCard(category.name || category.key),
        { type: 'grid', columns: Math.min(deviceCards.length, categoryColumns), square: false, cards: deviceCards },
      ],
    });
  }

  const body = {
    type: 'vertical-stack',
    cards: [builders.buildHeadingCard(area.name), ...groups],
    layout_options: { grid_columns: 'full' },
  };

  const cards = [body];
  if (config.navbar) cards.push(builders.buildNavbarCard(config.navbar, utils.backButtonExtraPaths(config)));

  return {
    title: area.name,
    path: `room_${area.area_id}`,
    icon: area.icon || 'mdi:floor-plan',
    type: 'sections',
    max_columns: 4,
    ...(config.theme ? { theme: config.theme } : {}),
    ...(utils.isHiddenFromNativeTabs(config, true) ? { subview: true } : {}),
    sections: [{ type: 'grid', column_span: 4, cards }],
  };
}

// The picker the Home view's "Geräte" button links to — one tile per
// device_categories entry, plus a "Kameras" tile (when at least one camera
// exists) linking to the Kameras view.
export function buildDevicesView(config, hass, builders, utils, hasCameras) {
  const layout = config.layout || {};
  const buttonHeight = layout.button_height ?? 90;
  const devicesColumns = layout.devices_columns ?? 2;
  const categories = config.device_categories || [];
  const categoryCards = categories.map((category) =>
    builders.buildCategoryButtonCard(category, `/${hass.panelUrl}/devices_${category.key}`, buttonHeight)
  );
  if (hasCameras) {
    const camerasCard = builders.buildCategoryButtonCard(
      { key: 'kameras', name: 'Kameras', icon: 'mdi:cctv' },
      `/${hass.panelUrl}/kameras`,
      buttonHeight
    );
    // Inserted just before the last tile rather than appended, so a
    // "Sonstiges" catch-all placed last in device_categories stays last.
    categoryCards.splice(Math.max(categoryCards.length - 1, 0), 0, camerasCard);
  }

  const body = {
    type: 'vertical-stack',
    cards: [
      builders.buildHeadingCard(config.devices_heading),
      categoryCards.length ? { type: 'grid', columns: devicesColumns, square: false, cards: categoryCards } : null,
    ].filter(Boolean),
    layout_options: { grid_columns: 'full' },
  };

  const cards = [body];
  if (config.navbar) cards.push(builders.buildNavbarCard(config.navbar, utils.backButtonExtraPaths(config)));

  return {
    title: config.devices_heading,
    path: 'devices',
    icon: 'mdi:devices',
    type: 'sections',
    max_columns: 4,
    ...(config.theme ? { theme: config.theme } : {}),
    ...(utils.isHiddenFromNativeTabs(config, true) ? { subview: true } : {}),
    sections: [{ type: 'grid', column_span: 4, cards }],
  };
}

// One view per device_categories entry, listing every entity assigned to
// it across all areas, grouped by area via auto-area-device-card.js.
//
// entityIds is that category's share of the assignEntitiesToCategories
// result computed once in panel-strategy.js, passed as a literal
// `entity_ids:` list rather than `filters: [category]` — passing the
// filter directly would re-match it in isolation, with no notion of
// "already claimed by an earlier category", so a broad catch-all like
// "Sonstiges" would match everything instead of only its leftovers.
export function buildDeviceCategoryView(category, entityIds, config, hass, builders, utils) {
  const listCard = {
    type: 'custom:auto-area-device-card',
    entity_ids: entityIds,
    ...(category.button_type ? { button_type: category.button_type } : {}),
    hidden_labels: config.areas?.hidden_labels || ['hidden'],
  };

  const body = {
    type: 'vertical-stack',
    cards: [builders.buildHeadingCard(category.name || category.key), listCard],
    layout_options: { grid_columns: 'full' },
  };

  const cards = [body];
  if (config.navbar) cards.push(builders.buildNavbarCard(config.navbar, utils.backButtonExtraPaths(config)));

  return {
    title: category.name || category.key,
    path: `devices_${category.key}`,
    icon: category.icon || 'mdi:devices',
    type: 'sections',
    max_columns: 4,
    ...(config.theme ? { theme: config.theme } : {}),
    ...(utils.isHiddenFromNativeTabs(config, true) ? { subview: true } : {}),
    sections: [{ type: 'grid', column_span: 4, cards }],
  };
}

// One advanced-camera-card covering every non-excluded camera.* entity —
// auto-discovered like everything else in this strategy, so a new camera
// needs no dashboard edit. Only generated by panel-strategy.js when at
// least one camera entity exists.
export function buildCamerasView(config, hass, builders, utils, cameraEntityIds) {
  const camerasCard = builders.buildCamerasCard(cameraEntityIds, config.cameras?.live_provider || 'go2rtc');
  const cards = [{ type: 'vertical-stack', cards: [camerasCard], layout_options: { grid_columns: 'full' } }];
  if (config.navbar) cards.push(builders.buildNavbarCard(config.navbar, utils.backButtonExtraPaths(config)));

  return {
    title: 'Kameras',
    path: 'kameras',
    icon: 'mdi:cctv',
    type: 'sections',
    max_columns: 4,
    ...(config.theme ? { theme: config.theme } : {}),
    ...(utils.isHiddenFromNativeTabs(config, false) ? { subview: true } : {}),
    sections: [{ type: 'grid', column_span: 4, cards }],
  };
}

// A fully custom view from config.views.extra — just wraps the user's own
// `cards:` list in the same sections/navbar shell every other view uses.
// There's no generic way to auto-discover, say, a specific solar inverter's
// or vehicle integration's entities, so a page like that is plain
// hand-written config rather than a built-in strategy feature — the same
// role bonbon-strategy's own `object:` cards convention fills.
export function buildExtraView(viewConfig, config, hass, builders, utils) {
  const cards = [{ type: 'vertical-stack', cards: viewConfig.cards, layout_options: { grid_columns: 'full' } }];
  if (config.navbar) cards.push(builders.buildNavbarCard(config.navbar, utils.backButtonExtraPaths(config)));

  return {
    title: viewConfig.title,
    path: viewConfig.path,
    icon: viewConfig.icon || 'mdi:view-dashboard',
    type: 'sections',
    max_columns: 4,
    ...(config.theme ? { theme: config.theme } : {}),
    ...(utils.isHiddenFromNativeTabs(config, Boolean(viewConfig.back_button)) ? { subview: true } : {}),
    sections: [{ type: 'grid', column_span: 4, cards }],
  };
}
