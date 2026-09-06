// Authored working values, in metres. Activity patches and lanes are invisible.
export const BIRD_CONFIG=Object.freeze({
  url:'/assets/models/campus-birds/campus-birds-v03.glb',
  counts:{sparrow:3,pigeon:2},candidateLimit:16,queryInterval:.1,
  dwell:{sparrow:[15,35],pigeon:[30,60]},cooldown:8,
  proximity:{sparrow:{flee:10,alert:12,relax:14,landing:12,initial:10.5},pigeon:{flee:10,alert:12,relax:14,landing:12,initial:10.5}},
  neighbourDistance:5,neighbourDelay:[.1,.3],minimumFlight:3,
  chirpInterval:[8,17],patchRadius:[1.5,3],cellSize:.8,
  sparrowGroundWeight:.5,
  visibility:{distance:{sparrow:22,pigeon:22},preferredDistance:{sparrow:14,pigeon:14},frameMargin:.88,
    preference:.85,preferredCandidates:12,absenceSeconds:5,interval:[18,28],retrySeconds:4},
  clearance:{sparrow:{radius:.24,height:.18,offset:.06,foldedRadius:.095,foldedHeight:.052,foldedOffset:.08},pigeon:{radius:.43,height:.36,offset:.12,foldedRadius:.195,foldedHeight:.105,foldedOffset:.13}},
  // These broad envelopes are clipped against boundary, terrain, buildings and equipment.
  groundZones:[
    {id:'front-courtyard',bounds:[-15.2,10.0,-13.4,-2.0]},
    {id:'main-playground',bounds:[-42.0,23.0,-46.0,-24.5]},
    {id:'old-classroom-yard',bounds:[14.5,29.0,-55.0,-51.8]},
  ],
  // A closed, inspected circuit; its height is derived from complete roofs / crowns at bind time.
  airCircuit:[[-2.5,-8],[16,-33],[25,-53],[0,-36],[-25,-34]],
  airClearance:1.8,
})
