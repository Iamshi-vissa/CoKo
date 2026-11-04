// Mood → sprite image map for CoKo's character.
//
// While this object is empty, CoKo uses the built-in vector mascot.
// To use your own art (for example images generated with ComfyUI), run:
//
//     python tools/make_sprites.py path/to/happy.png path/to/sleepy.png ...
//
// Name each source image after its mood: happy, focused, sleepy, tired,
// worried, panic, excited, giggle, love, surprised or wave.
// Only "happy" is required; any missing mood falls back to the closest one.
// The script removes the background, trims and resizes each image, and
// rewrites this file.
window.KOKO_SPRITES = {};
