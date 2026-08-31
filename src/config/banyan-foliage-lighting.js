const candidate=(colorMultiplier,roughness,specularIntensity,emissiveIntensity)=>Object.freeze({
  colorMultiplier:Object.freeze(colorMultiplier),roughness,specularIntensity,emissiveIntensity,
})

// A2 已由用户在实际校园画面确认并封板。A0/A1 只保留为开发与测试回退，
// 便于以后定位材质或灯光回归，不进入正式运行时选择。
export const BANYAN_FOLIAGE_LIGHTING=Object.freeze({
  formalCandidate:'A2',
  candidates:Object.freeze({
    A0:candidate([1,1,1],.92,.10,0),
    A1:candidate([1,1,1],.68,.30,0),
    A2:candidate([1.12,1.18,1.08],.62,.40,.06),
  }),
})
