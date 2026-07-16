export const PLATFORM_VALUES = ['switch', 'playstation', 'xbox', 'pc', 'mobile'] as const;
export type Platform = (typeof PLATFORM_VALUES)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  switch: 'Nintendo Switch',
  playstation: 'PlayStation',
  xbox: 'Xbox',
  pc: 'PC',
  mobile: 'Mobile',
};
