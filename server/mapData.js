const SHIP_MAP = {
  width: 2200,
  height: 1500,
  zoneCenter: { x: 1100, y: 750 },
  zoneStartRadius: 760,
  walls: [
    { x: 280, y: 210, w: 430, h: 220, label: "Bridge" },
    { x: 835, y: 245, w: 540, h: 190, label: "Cafeteria" },
    { x: 1540, y: 200, w: 360, h: 250, label: "Navigation" },
    { x: 260, y: 835, w: 360, h: 250, label: "MedBay" },
    { x: 820, y: 840, w: 560, h: 280, label: "Storage" },
    { x: 1560, y: 860, w: 350, h: 255, label: "Reactor" },
    { x: 1090, y: 530, w: 85, h: 450, label: "Core Pillar" },
    { x: 705, y: 545, w: 80, h: 340, label: "Pipe A" },
    { x: 1415, y: 560, w: 80, h: 340, label: "Pipe B" }
  ],
  spawnPoints: [
    { x: 200, y: 150 },
    { x: 760, y: 140 },
    { x: 1430, y: 145 },
    { x: 1990, y: 175 },
    { x: 215, y: 575 },
    { x: 670, y: 710 },
    { x: 980, y: 680 },
    { x: 1265, y: 700 },
    { x: 1490, y: 690 },
    { x: 1960, y: 625 },
    { x: 220, y: 1250 },
    { x: 760, y: 1260 },
    { x: 1140, y: 1270 },
    { x: 1500, y: 1270 },
    { x: 2020, y: 1240 }
  ]
};

function randomSpawn() {
  const pick = SHIP_MAP.spawnPoints[Math.floor(Math.random() * SHIP_MAP.spawnPoints.length)];
  return { x: pick.x, y: pick.y };
}

module.exports = {
  SHIP_MAP,
  randomSpawn
};