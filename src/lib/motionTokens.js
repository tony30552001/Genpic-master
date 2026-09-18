export const GLYPH_SPRING = {
  type: "spring",
  stiffness: 460,
  damping: 32,
  mass: 0.7,
};

export const GLYPH_FEEDBACK = {
  duration: 0.16,
  ease: [0.22, 1, 0.36, 1],
};

export const GLYPH_SUCCESS = {
  duration: 0.32,
  ease: [0.22, 1, 0.36, 1],
};

export const GENERATION_LOOP = {
  duration: 1.8,
  ease: "easeInOut",
  repeat: Infinity,
};

/** Mirrors --motion-enter / --ease-emphasized in src/index.css. */
export const OVERLAY_ENTER = {
  duration: 0.25,
  ease: [0.22, 1, 0.36, 1],
};

/** Mirrors --motion-exit / --ease-exit in src/index.css. */
export const OVERLAY_EXIT = {
  duration: 0.15,
  ease: [0.4, 0, 0.2, 1],
};
