export default {
  meta:{title:'Sì Xiǎo · 4Lite',description:'Sì Xiǎo · 4Lite: return to a Guangdong primary school remembered from the early 1980s.'},
  brand:{name:'Sì Xiǎo',romanization:'Sì Xiǎo',translation:'No. 4 Primary School'},
  language:{switchLabel:'Language',switchText:'中文',switchAria:'切换到中文'},
  entry:{
    aria:'Sì Xiǎo',copy:'The breeze is coming down the corridor.<br>Step back into the school we remember.',enter:'Return to That Summer',
    musicOn:'Music On',musicOff:'Play Music',musicPlayAria:'Play background music',musicPauseAria:'Pause background music',
    linksAria:'Project information',story:'Story',about:'About',help:'Guide',footnote:'Headphones recommended · The campus loads after you enter',
    entering:'Returning to the campus…',enteringCopy:'Old desks, corridors and tree shadows are stirring.<br>Your first visit may take a moment to load.',
    loadError:'The campus could not be loaded. Please refresh the page and try again.',
  },
  loading:{
    visual:'Preparing the campus…',eyebrow:'Before You Enter',retry:'Try Again',preparing:'Preparing resources {completed} / {total}',readyCount:'The campus is ready',
    readyMessage:'Take one more walk before the school day ends.',failure:'Some campus resources could not be prepared.',
    messages:['Preparing old desks and corridors…','Letting sunlight back into the classrooms…','Waking the shadows beside the playground…','Bringing the breeze back to the campus…'],
    tips:[
      ['Take Your Time','Enter through the school gate and explore the corridors, classrooms, playground and shade in first person, or switch to the aerial view at any time.'],
      ['Open a Door, Take a Seat','Look at classroom doors, windows and desks to find interaction prompts. Once seated, you can browse old textbooks and exercise books.'],
      ['Leave a Mark on the Blackboard','All 22 teaching blackboards can be written on, erased and undone. Your drawings are saved in this browser.'],
      ['Pick Up a Piece of Chalk','Chalk is scattered around the classrooms and teachers’ desks. Pick it up, charge a throw, and retrieve it after it lands.'],
      ['Shoot a Few Hoops','Basketballs can be picked up, thrown, pushed and kicked. Baskets from different distances score two, three or four points.'],
      ['Play on an Old Table','All six table-tennis tables on the west side are playable. Practise freely or play a first-to-seven match against the computer.'],
      ['Walk to the Green Marker','Look slightly down. When the green destination marker appears, click or tap to walk there. Look around as you move; click, tap or use movement controls to stop.'],
      ['The Campus Works on Mobile','Use the left joystick to move and drag the view to look around. Tap a green marker to walk, or aim at an object and tap to interact.'],
    ],
  },
  accessibility:{touchLook:'Drag to look around; tap a green marker to walk, tap again to stop, or aim at an object and tap to interact',joystick:'Movement joystick'},
  routes:{home:'/en/',about:'/en/about/',help:'/en/help/',story:'/stories/from-memory-to-campus/en/'},
}
