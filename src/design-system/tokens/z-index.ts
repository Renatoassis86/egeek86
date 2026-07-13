/**
 * Z-index scale. Use SEMPRE tokens; nunca número arbitrário.
 * Ordem ascendente = mais para cima.
 */
export const zIndex = {
  base: 0,
  raised: 10,
  sticky: 20,
  header: 30,
  bottomTabBar: 30,
  drawer: 40,
  modal: 50,
  popover: 60,
  tooltip: 70,
  toast: 80,
  command: 90,
  max: 9999,
} as const;
