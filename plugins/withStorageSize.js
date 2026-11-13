/**
 * Raises the size limit of the on-device key-value store on Android.
 *
 * AsyncStorage's default database cap on Android is 6 MB, which a daily
 * logger reaches after a year or two. iOS has no such cap. The app also keeps
 * each stored value small (see src/store/persistence.ts); this lifts the total.
 */
const { withGradleProperties } = require('expo/config-plugins');

const KEY = 'AsyncStorage_db_size_in_MB';

module.exports = function withStorageSize(config, { megabytes = 64 } = {}) {
  return withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter((item) => !(item.type === 'property' && item.key === KEY));
    cfg.modResults.push({ type: 'property', key: KEY, value: String(megabytes) });
    return cfg;
  });
};
