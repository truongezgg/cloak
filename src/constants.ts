export const CLOAK_MARKER = '# CLOAK: ENCRYPTED'
export const PAYLOAD_VERSION = 1
const PREFERRED_MATCHERS_LIST = [
  /^\.env(?:\..+)?$/,
  /\.json$/,
  /\.txt$/,
  /\.pem$/,
  /\.key$/,
] as const
export const PREFERRED_MATCHERS = PREFERRED_MATCHERS_LIST
