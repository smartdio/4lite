import campusSketchUrl from '../docs/references/001-campus-plan-sketch.jpg'
import gateScreenshotUrl from '../tests/performance/baselines/gate.png'
import courtyardScreenshotUrl from '../tests/performance/baselines/courtyard.png'
import basketballScreenshotUrl from '../tests/performance/baselines/activityBasketball.png'
import pingPongScreenshotUrl from '../tests/performance/baselines/pingPongMatch.png'
import './info-page.js'

const illustrations = {campusSketchUrl,gateScreenshotUrl,courtyardScreenshotUrl,basketballScreenshotUrl,pingPongScreenshotUrl}
document.querySelectorAll('[data-illustration]').forEach(image => {
  image.src = illustrations[image.dataset.illustration]
})
