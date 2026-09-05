/** Primary-button play area in the fixed 1920×1080 HUD. Pointer coordinates
 * only decide whether to throw/catch; they never set the projectile direction.
 * Keep the score strip, touch controls and letterboxing out of play input.
 */
export const isDodgeballPlayPoint=(x,y)=>Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&x<=1920&&y>=300&&y<870
