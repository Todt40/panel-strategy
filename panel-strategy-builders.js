// panel-strategy-builders.js
//
// One function per card kind the strategy generates. Everything renders as
// custom:bubble-card except the headings (plain markdown). A fully custom
// view (config.views.extra) supplies its own raw cards instead, so there's
// nothing to build for those here.

// bubble-card only treats the whole button as clickable when
// button_action.tap_action is set — plain tap_action alone only reacts on
// the icon.
function withTapAction(tapAction) {
  return { tap_action: tapAction, button_action: { tap_action: tapAction } };
}

// bubble-card renders its own <ha-ripple> on tap and has a JS-driven
// marquee text-scroll for overflowing names/states — both are disabled
// here via bubble-card's own `styles:` field (applied synchronously by the
// card itself, unlike card_mod which can lose a timing race for a batch of
// cards created together).
const BASE_STYLES = `ha-ripple { display: none !important; }
  .scrolling-container span { animation: none !important; transform: none !important; white-space: normal !important; }`;

function withStyles(extraStyle) {
  return { styles: extraStyle ? `${BASE_STYLES}\n${extraStyle}` : BASE_STYLES };
}

// Sizes a bubble-card button. minHeight can be a number (px) or a raw CSS
// length; null leaves :host's height to its container (e.g. a stretched
// grid cell).
//
// Every step in the height chain (:host -> ha-card -> .card-content ->
// .bubble-container) needs its own explicit height and `!important` —
// bubble-card sets ha-card/.card-content's height itself via
// calc(var(--row-height) * var(--row-size)), which otherwise wins.
//
// Padding is top:0, bottom only — bubble-card's content row docks to the
// top of the card (align-self: flex-start) rather than centering, so a
// symmetric padding just pushes the content down without adding anything
// visible below it.
function withSize(minHeight, extraStyle) {
  const heightCss = typeof minHeight === 'number' ? `${minHeight}px` : minHeight;
  const bubbleContainerHeight = minHeight == null ? '100% !important' : `${heightCss} !important`;
  const heightBlock = `
    ${minHeight == null ? '' : `:host { height: ${heightCss}; }`}
    ha-card { height: 100% !important; padding: 0 0 8px 0 !important; }
    .card-content { height: 100% !important; }
    .bubble-container { height: ${bubbleContainerHeight}; }
  `;
  return withStyles(`
    ${heightBlock}
    .bubble-button { width: 100%; overflow: visible !important; }
    .bubble-name, .bubble-state, .bubble-sub-button-name {
      white-space: normal !important;
      overflow: visible !important;
      text-overflow: unset !important;
    }
    ${extraStyle || ''}
  `);
}

// height is config.layout.button_height/room_card_height — plumbed through
// from views.js rather than fixed here, so every card kind stays sized
// consistently off the same config.
function personCardStyles(height) {
  return withSize(
    height,
    '.bubble-icon-container { width: 60px !important; height: 60px !important; min-width: 60px !important; min-height: 60px !important; }'
  );
}
function buttonStyles(height) {
  return withSize(height);
}

// roomCardStyles' padding-bottom is a real part of each card's footprint —
// the Home view's row-count math (panel-strategy-views.js) accounts for it
// too, so keep the two in sync if this changes.
function roomCardStyles(rowHeightPx, paddingBottomPx) {
  return withSize(rowHeightPx, `:host { scroll-snap-align: start; padding-bottom: ${paddingBottomPx}px; }`);
}

const AWAY_TINT_STYLES = `:host { opacity: 0.6; }`;

export function buildPersonCard(person, hass, height, awayDimming) {
  const state = hass?.states?.[person.entity]?.state;
  const isAway = awayDimming && state !== undefined && state !== 'home';
  const cardStyles = personCardStyles(height);
  const baseStyles = cardStyles.styles;
  const card = {
    type: 'custom:bubble-card',
    card_type: 'button',
    button_type: 'state',
    name: person.name,
    entity: person.entity,
    show_state: true,
    show_last_changed: false,
    use_accent_color: true,
    ...withTapAction({ action: 'more-info' }),
    ...cardStyles,
    styles: isAway ? `${baseStyles}\n${AWAY_TINT_STYLES}` : baseStyles,
  };
  if (person.battery_level) {
    card.sub_button = [
      {
        entity: person.battery_level,
        icon: 'mdi:battery',
        show_state: true,
        show_background: false,
        content_layout: 'icon-left',
        tap_action: { action: 'more-info' },
      },
    ];
  }
  return card;
}

// name/icon override the entity's own name/domain icon — useful when an
// entity's own icon/friendly name isn't what you want shown (e.g. a
// lock exposed as a plain binary_sensor, with no lock-shaped icon of its
// own).
export function buildSecurityCard(entityId, height, name, icon) {
  return {
    type: 'custom:bubble-card',
    card_type: 'button',
    button_type: 'state',
    entity: entityId,
    show_state: true,
    ...(name ? { name } : {}),
    ...(icon ? { icon } : {}),
    ...withTapAction({ action: 'more-info' }),
    ...buttonStyles(height),
  };
}

// Plain page heading, no card chrome. --contrast20 matches the theme
// variable the original dashboard's heading used, with a fallback.
export function buildHeadingCard(text) {
  return {
    type: 'markdown',
    content: `# ${text}`,
    card_mod: {
      style: `
        ha-card { background: none; border: none; box-shadow: none; padding: 9px 0; text-align: center; }
        ha-markdown h1 { font-size: 32px; font-weight: normal; margin: 0; color: var(--contrast20, var(--primary-text-color)); }
      `,
    },
  };
}

// Smaller, left-aligned heading for a group of cards within a page.
export function buildSectionHeadingCard(text) {
  return {
    type: 'markdown',
    content: `## ${text}`,
    card_mod: {
      style: `
        ha-card { background: none; border: none; box-shadow: none; padding: 4px 0; }
        ha-markdown h2 { font-size: 20px; font-weight: 600; margin: 0; color: var(--primary-text-color); }
      `,
    },
  };
}

// A room subview's per-entity button. buttonType 'switch' already toggles
// on tap by itself, so tap_action is only added for 'state' buttons —
// otherwise it would override the built-in toggle with more-info.
export function buildDeviceCard(entityId, buttonType, height) {
  return {
    type: 'custom:bubble-card',
    card_type: 'button',
    button_type: buttonType,
    entity: entityId,
    show_state: true,
    ...(buttonType === 'state' ? withTapAction({ action: 'more-info' }) : {}),
    ...buttonStyles(height),
  };
}

export function buildRoomCard(area, navigationPath, rowHeightPx, paddingBottomPx) {
  const navigate = { action: 'navigate', navigation_path: navigationPath };
  const card = {
    type: 'custom:bubble-card',
    card_type: 'button',
    button_type: 'name',
    name: area.name,
    icon: area.icon || 'mdi:floor-plan',
    ...withTapAction(navigate),
    ...roomCardStyles(rowHeightPx, paddingBottomPx),
  };
  // Temperature and humidity as two equal sub_buttons next to the room
  // name (not one bound as the card's main state) — matches the original
  // dashboard's plain "24°C  52%" pair.
  const subButtons = [];
  if (area.temperature_entity_id) {
    subButtons.push({
      entity: area.temperature_entity_id,
      show_state: true,
      show_background: false,
      tap_action: navigate,
    });
  }
  if (area.humidity_entity_id) {
    subButtons.push({
      entity: area.humidity_entity_id,
      show_state: true,
      show_background: false,
      tap_action: navigate,
    });
  }
  if (subButtons.length) {
    card.sub_button = subButtons;
  }
  return card;
}

// Plain "icon + name, tap to navigate" button — the Home view's "Geräte"
// button and each tile on the devices picker.
function buildNavigationButtonCard(name, icon, navigationPath, height) {
  return {
    type: 'custom:bubble-card',
    card_type: 'button',
    button_type: 'name',
    name,
    icon,
    ...withTapAction({ action: 'navigate', navigation_path: navigationPath }),
    ...buttonStyles(height),
  };
}

export function buildDevicesButtonCard(navigationPath, height) {
  return buildNavigationButtonCard('Geräte', 'mdi:devices', navigationPath, height);
}

export function buildCategoryButtonCard(category, navigationPath, height) {
  return buildNavigationButtonCard(category.name || category.key, category.icon || 'mdi:devices', navigationPath, height);
}

// A back arrow, shown only on subviews reached by drilling down from a
// top-level tab (a room, the devices picker/its category pages, Kameras, or
// any views.extra entry with back_button: true) — never on a top-level tab
// itself, which already has its own navbar icon. navbar-card's `hidden:`
// field accepts a JS template string ([[[ ... ]]]); `navigate-back` is its
// built-in action for window.history.back().
function buildBackButtonRoute(extraBackButtonPaths) {
  const paths = ['room_', 'devices', 'kameras', ...extraBackButtonPaths].join('|');
  return {
    icon: 'mdi:arrow-left',
    hidden: `[[[ return !/\\/(${paths})/.test(window.location.pathname); ]]]`,
    tap_action: { action: 'navigate-back' },
  };
}

export function buildNavbarCard(navbarConfig, extraBackButtonPaths = []) {
  const backButtonRoute = buildBackButtonRoute(extraBackButtonPaths);
  const routes = navbarConfig.routes ? [backButtonRoute, ...navbarConfig.routes] : navbarConfig.routes;
  return {
    type: 'custom:navbar-card',
    ...navbarConfig,
    ...(routes ? { routes } : {}),
  };
}

// One advanced-camera-card covering every camera — its own picker/carousel
// handles switching between them.
export function buildCamerasCard(cameraEntityIds, liveProvider) {
  return {
    type: 'custom:advanced-camera-card',
    cameras: cameraEntityIds.map((entityId) => ({ camera_entity: entityId, live_provider: liveProvider })),
  };
}
