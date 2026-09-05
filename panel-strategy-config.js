// panel-strategy-config.js
//
// Default config values. Anything the user's own `strategy:` YAML sets
// overrides these via mergeDeep in panel-strategy.js.

export const defaultConfig = {
  theme: null,
  home_heading: 'Home',
  devices_heading: 'Geräte',
  weather_entity: null,
  weather_name: null,
  weather_secondary_info_attribute: null,
  weather_forecast_type: 'daily',
  weather_show_forecast: false,
  // Dims a person's card whenever their state isn't exactly 'home'
  // (including a named zone, not just not_home). Set false to disable.
  person_away_dimming: true,
  // Fixed door cards on the Home view (not an auto-detected domain-wide
  // list). Each entry: {lock_entity?, sensor_entity?, lock_name?,
  // lock_icon?, sensor_name?, sensor_icon?} — name/icon override the
  // entity's own, useful e.g. for a lock exposed as a plain binary_sensor.
  // Rendered as a 3-column grid, wrapping to further rows of 3.
  doors: [],
  persons: [],
  device_categories: [],
  areas: {
    hidden_labels: ['hidden'],
  },
  // The Kameras view (auto-discovered camera.* entities). live_provider is
  // applied to every discovered camera the same way.
  cameras: {
    live_provider: 'go2rtc',
  },
  // Room-card columns visible per screenful on the Home view. Row count is
  // computed separately (from window.innerHeight at generate() time);
  // extra rooms page off-screen via horizontal scroll/swipe.
  room_columns: 3,
  // Sizing/spacing knobs for anyone who wants a denser or roomier layout
  // than the defaults (tuned for a ~10" tablet). See the README's Layout
  // section for what each one actually affects.
  layout: {
    button_height: 90,
    room_card_height: 150,
    room_grid_gap: 18,
    block_gap: 12,
    devices_columns: 2,
    room_category_columns: 3,
    // Overrides the estimated fixed-chrome height used to compute how many
    // room-grid rows fit on screen — only needed if rooms look clipped or
    // under-filled with the default. See the README's Layout section.
    reserved_height: null,
  },
  navbar: null,
  // Hides Home/Kameras/plain views.extra entries from HA's own built-in
  // top view-tab strip once navbar is set (room/device pages are always
  // hidden from it regardless). Set false to show them there too — see
  // isHiddenFromNativeTabs in panel-strategy-utils.js.
  hide_native_tabs: true,
  views: {
    // Escape hatch for hand-written cards (type: 'cards') appended after
    // the room grid — weather/devices/doors/persons/room_cards are always
    // built directly by buildHomeView() and aren't driven by this list.
    home: {
      sections: [],
    },
    // Fully custom extra top-level views — verbatim `cards:` passed
    // straight to Lovelace, not generated from any entity filter. Each
    // entry: {title, path, icon?, cards: [...], back_button?}.
    // back_button: true treats it as a subview (back-arrow, hidden from
    // native tabs) instead of a top-level tab.
    extra: [],
  },
};
