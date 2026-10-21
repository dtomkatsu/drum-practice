// Step grids. One char per step: X accent, x normal, g ghost, - rest.
// `steps` = steps per bar, `perBeat` = steps per beat (4 = 16ths, 3 = triplets).
// Tracks: k kick, s snare, h closed hat, o open hat, r ride, c crash, t rim.
export const PATTERNS = [
  {
    name: "Rock 8ths", steps: 16, perBeat: 4,
    k: "x-------x-x-----",
    s: "----X-------X---",
    h: "x-x-x-x-x-x-x-x-",
  },
  {
    name: "Four on the Floor", steps: 16, perBeat: 4,
    k: "X---x---X---x---",
    s: "----X-------X---",
    h: "--x---x---x---x-",
    o: "--x---x---x---x-",
  },
  {
    name: "Funk 16ths", steps: 16, perBeat: 4,
    k: "x-----x---x--x--",
    s: "----X--g-g--X--g",
    h: "xxxxxxxxxxxxxxxx",
  },
  {
    name: "Half-Time", steps: 16, perBeat: 4,
    k: "x-----x-x-------",
    s: "--------X-------",
    h: "x-x-x-x-x-x-x-x-",
  },
  {
    name: "Shuffle", steps: 12, perBeat: 3,
    k: "x-----x--x--",
    s: "---X-----X--",
    h: "x-xx-xx-xx-x",
  },
  {
    name: "12/8 Blues", steps: 12, perBeat: 3,
    k: "x-----x-----",
    s: "---X-----X--",
    r: "xxxxxxxxxxxx",
  },
  {
    name: "Bossa Nova", steps: 16, perBeat: 4,
    k: "x--xx--xx--xx--x",
    t: "x--x--x---x--x--",
    h: "x-x-x-x-x-x-x-x-",
  },
  {
    name: "Reggae One Drop", steps: 12, perBeat: 3,
    k: "------X-----",
    s: "------X-----",
    h: "x-xx-xx-xx-x",
  },
  {
    name: "Click Only", steps: 4, perBeat: 1,
    t: "Xxxx",
  },
];
