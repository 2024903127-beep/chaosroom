export const SHIP_MAP = {
  width: 2200,
  height: 1500,
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
  strips: [
    { x: 0, y: 500, w: 2200, h: 18 },
    { x: 0, y: 760, w: 2200, h: 18 },
    { x: 0, y: 1120, w: 2200, h: 18 }
  ],
  vents: [
    { x: 500, y: 560, r: 18 },
    { x: 960, y: 620, r: 18 },
    { x: 1720, y: 610, r: 18 },
    { x: 1000, y: 1230, r: 18 }
  ]
};