from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'docs/previews/hud-redesign-v02'
OUTPUT=ROOT/'public/assets/ui/hud-v02'

SMOOTH_SIZE=(2048,1280)
SMOOTH_RECTS={
    'default':(0,0,256,256),'look':(256,0,256,256),'open-door':(512,0,256,256),'open-window':(768,0,256,256),
    'pick-up-chalk':(0,256,256,256),'pick-up-basketball':(256,256,256,256),'shoot-basketball':(512,256,256,256),'sit-down':(768,256,256,256),
    'stand-up':(0,512,256,256),'start-ping-pong':(256,512,256,256),'throw-chalk':(512,512,256,256),'write':(768,512,256,256),
    'standing':(0,768,256,256),'walking':(256,768,256,256),'sitting':(512,768,256,256),'start-bamboo-climb':(768,768,256,256),
    'start-long-jump':(0,1024,256,256),
    'start-hopscotch':(256,1024,256,256),'start-shuttlecock':(512,1024,256,256),'start-jacks':(768,1024,256,256),
    'tutorial-desktop':(1024,0,1024,512),'tutorial-mobile':(1024,512,1024,512),
}
INTERACTION_NAMES=('default','look','open-door','open-window','pick-up-chalk','pick-up-basketball','shoot-basketball','sit-down','stand-up','start-ping-pong','throw-chalk','write','start-bamboo-climb','start-long-jump','start-hopscotch','start-shuttlecock','start-jacks')
SMOOTH_FILES={
    **{name:SOURCE/'interaction'/f'{name}-v02.png' for name in INTERACTION_NAMES},
    **{name:SOURCE/'posture'/f'{name}-v02.png' for name in ('standing','walking','sitting')},
    'tutorial-desktop':SOURCE/'tutorial/onboarding-desktop-v02.png',
    'tutorial-mobile':SOURCE/'tutorial/onboarding-mobile-v02.png',
}

PIXEL_SIZE=(1024,512)
PIXEL_RECTS={
    'basketball-score':(0,0,512,256),'basketball-hit-plus-one':(512,0,512,256),
    'ping-pong-good-shot':(0,256,512,256),'ping-pong-score-plus-one':(512,256,512,256),
}
PIXEL_FILES={name:SOURCE/'pixel-text'/f'{name}.png' for name in PIXEL_RECTS}

MINIGAME_SIZE=(2048,1024)
MINIGAME_RECTS={
    'basketball-desktop':(0,0,1024,512),'basketball-mobile':(1024,0,1024,512),
    'ping-pong-desktop':(0,512,1024,512),'ping-pong-mobile':(1024,512,1024,512),
}
MINIGAME_FILES={name:SOURCE/'tutorial/minigames'/f'{name}-v02.png' for name in MINIGAME_RECTS}

def contain(source,rect,resample):
    x,y,width,height=rect
    source_image=Image.open(source)
    image=source_image.convert('RGBA')
    # ImageGen occasionally bakes its transparency checker into an RGB export.
    # Only the new cursor masters use this neutral near-white checker; their
    # warm ivory artwork has a deliberately non-neutral hue and is preserved.
    if source_image.mode == 'RGB' and source.name in {'start-hopscotch-v02.png','start-shuttlecock-v02.png','start-jacks-v02.png'}:
        pixels=image.load()
        for source_y in range(image.height):
            for source_x in range(image.width):
                red,green,blue,_=pixels[source_x,source_y]
                if min(red,green,blue)>=235 and max(red,green,blue)-min(red,green,blue)<=9:
                    pixels[source_x,source_y]=(red,green,blue,0)
    alpha=image.getchannel('A')
    bounds=alpha.point(lambda value:255 if value>=24 else 0).getbbox()
    if bounds:
        image=image.crop(bounds)
    image.thumbnail((round(width*.84),round(height*.84)),resample)
    return image,(x+(width-image.width)//2,y+(height-image.height)//2)

def build(size,rects,files,resample,destination):
    atlas=Image.new('RGBA',size,(0,0,0,0))
    for name,rect in rects.items():
        image,position=contain(files[name],rect,resample)
        atlas.alpha_composite(image,position)
    destination.parent.mkdir(parents=True,exist_ok=True)
    atlas.save(destination,optimize=True,compress_level=9)

build(SMOOTH_SIZE,SMOOTH_RECTS,SMOOTH_FILES,Image.Resampling.LANCZOS,OUTPUT/'hud-smooth-atlas-v03.png')
build(MINIGAME_SIZE,MINIGAME_RECTS,MINIGAME_FILES,Image.Resampling.LANCZOS,OUTPUT/'hud-minigame-tutorial-atlas-v02.png')
build(PIXEL_SIZE,PIXEL_RECTS,PIXEL_FILES,Image.Resampling.NEAREST,OUTPUT/'hud-pixel-atlas-v02.png')
