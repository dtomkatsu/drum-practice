// Step grids. One char per step: X accent, x normal, g ghost, - rest.
// `steps` = steps per bar, `perBeat` = steps per beat (4 = 16ths, 3 = triplets).
// Voices: k kick, s snare, t cross-stick, h closed hat, o open hat, r ride, c crash,
//         1 high tom, 2 mid tom, 3 floor tom.
// Each groove has `main`; optional `alt` (plays on every other bar) and `fill`
// (last bar of each phrase). alt/fill only override the voices they list.
// `swing` (0-0.5) delays every other subdivision by that fraction of a step.
// `lockKick` / `lockSnare` keep the variation engine away from parts that define the style.
export const PATTERNS = [
  {
    name: "Rock 8ths", steps: 16, perBeat: 4,
    main: { k: "x-------x-x-----", s: "----X-------X---", h: "X-x-X-x-X-x-X-x-" },
    alt:  { k: "x-------x-x---x-" },
    fill: { k: "x-------------X-", s: "----X---XxXx----", h: "X-x-X-x---------",
            1: "------------Xx--", 3: "--------------XX" },
  },
  {
    name: "Four on the Floor", lockKick: true, steps: 16, perBeat: 4,
    main: { k: "X---x---X---x---", s: "----X-------X---", h: "x-g-x-g-x-g-x-g-", o: "--x---x---x---x-" },
    alt:  { s: "----X-----g-X---" },
    fill: { s: "----X---x-x-xxXX", h: "x-g-x-g-x-------", o: "--x---x---------" },
    chorus: { o: "--X---X---X---X-", h: "x---x---x---x---", s: "----X-------X---" },
  },
  {
    name: "Funk 16ths", steps: 16, perBeat: 4, swing: 0.12,
    main: { k: "x-----x---x--x--", s: "----X--g-g--X--g", h: "xgxgxgxgxgxgxgxg" },
    alt:  { k: "x-x---x---x-----", s: "----X--g-g-gX---" },
    fill: { k: "x-----x---x-----", s: "----X--g-g-g----", h: "xgxgxgxgxgxg----",
            1: "------------Xx--", 2: "--------------X-", 3: "---------------X" },
  },
  {
    name: "Half-Time", steps: 16, perBeat: 4,
    main: { k: "x-----x-x-------", s: "--------X-------", h: "X-x-x-x-X-x-x-x-" },
    alt:  { k: "x-----x-x-----x-" },
    fill: { s: "--------X-g-xxXX", h: "X-x-x-x-X-x-----" },
  },
  {
    name: "Pop Ballad (cross-stick)", steps: 16, perBeat: 4,
    main: { k: "x-----x-x-------", t: "----x-------x---", h: "x-x-x-x-x-x-x-x-" },
    alt:  { k: "x-----x-x-----x-" },
    fill: { t: "----x-----------", s: "------------xxXX", h: "x-x-x-x-x-x-----" },
  },
  {
    name: "Boom Bap", steps: 16, perBeat: 4, swing: 0.18,
    main: { k: "x---------x-x---", s: "----X-------X---", h: "x-x-x-x-x-x-x-x-" },
    alt:  { k: "x------x--x-----", s: "----X-------X--g" },
  },
  {
    name: "Punk / Fast Rock", steps: 16, perBeat: 4,
    main: { k: "x-x---x-x-x---x-", s: "----X-------X---", r: "X-x-X-x-X-x-X-x-" },
    fill: { r: "X-x-X-x---------", s: "----X---XXXXXXXX" },
  },
  {
    name: "Train Beat (Country)", lockSnare: true, steps: 16, perBeat: 4,
    main: { k: "x-------x-------", s: "ggggXgggggggXggg" },
    fill: { s: "ggggXgggxxxxXXXX" },
  },
  {
    name: "Shuffle", steps: 12, perBeat: 3,
    main: { k: "x-----x-----", s: "---X-----X--", h: "x-xx-xx-xx-x" },
    alt:  { k: "x-----x--x--" },
    fill: { k: "x-----x-----", s: "---X--------", h: "x-xx-x------", 1: "------X-x---", 3: "---------X-X" },
  },
  {
    name: "12/8 Slow Blues", steps: 12, perBeat: 3,
    main: { k: "x-----x-----", s: "---X-----X--", r: "Xxxxxxxxxxxx" },
    alt:  { k: "x----xx-----" },
    fill: { r: "Xxxxxx------", s: "---X--gxXxXX" },
  },
  {
    // Ride spang-a-lang, hat foot on 2 & 4, feathered kick, sparse snare comping.
    name: "Jazz Swing", lockKick: true, comp: true, steps: 12, perBeat: 3, kit: "drs-brushes",
    main: { r: "x--X-xx--X-x", h: "---x-----x--", k: "g--g--g--g--", s: "-----------g" },
    alt:  { s: "-----g----g-" },
    fill: { r: "x--X-x------", s: "------g-xgxX", 3: "---------x--" },
    chorus: { k: "g--g--g--g-x", s: "--g--g--g--x" },
  },
  {
    name: "Jazz Waltz (3/4)", lockKick: true, comp: true, steps: 9, perBeat: 3, kit: "drs-brushes",
    main: { r: "x--x-xx-x", h: "---x--x--", k: "g--------" },
    alt:  { s: "------g--", k: "g-----g--" },
    fill: { r: "x--x-----", s: "----gxgxX" },
    chorus: { k: "x-----g--", s: "---g--g-x" },
  },
  {
    name: "Bossa Nova", lockKick: true, steps: 16, perBeat: 4, noCrash: true,
    main: { k: "x--xx--xx--xx--x", t: "x--x--x---x--x--", h: "x-x-x-x-x-x-x-x-" },
  },
  {
    // Beat 1 is empty; kick + cross-stick drop together on 3. Shuffled hats, a lift on the "and" of 4.
    name: "Reggae One Drop", lockKick: true, steps: 12, perBeat: 3,
    main: { k: "------X-----", t: "------X-----", h: "x-xx-xx-xx-x" },
    alt:  { t: "---g--X-----", h: "x-xx-xx-xx--", o: "-----------x" },
    fill: { k: "------X-----", t: "------X-----", h: "x-xx--------", 1: "------xxx---", 2: "---------xx-", 3: "-----------X" },
    chorus: { s: "------X-----", t: "---g--------" },
  },
  {
    // Four-on-the-floor kick under the shuffle; driving, militant feel.
    name: "Reggae Steppers", lockKick: true, steps: 12, perBeat: 3,
    main: { k: "X--x--X--x--", t: "------X-----", h: "x-xx-xx-xx-x" },
    alt:  { t: "------X--g--", o: "-----x------" },
    fill: { t: "------X-----", h: "x-xx-x------", 1: "------xxx---", 2: "---------xxx" },
    chorus: { s: "------X-----", t: "---g-----g--" },
  },
  {
    // Rockers: kick on 1 and 3, busy straight hats with a slight lilt, rim on 2 and 4.
    name: "Reggae Rockers", steps: 16, perBeat: 4, swing: 0.1,
    main: { k: "x-------x-----x-", t: "----X-------X---", h: "x-xxx-xxx-xxx-xx" },
    alt:  { k: "x-----x-x-------", o: "--------------x-" },
    fill: { t: "----X-----------", h: "x-xxx-xxx-------", 1: "--------xxx-----", 2: "-----------xx---", 3: "-------------xXX" },
    chorus: { s: "----X-------X---" },
  },
  {
    name: "Click Only", steps: 4, perBeat: 1, noCrash: true,
    main: { t: "Xxxx" },
    chorus: {},
  },
];
