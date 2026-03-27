// ---------------------------------------------------------------------------
// emoji-data.ts — Static emoji dataset with search and shortcode support
// ---------------------------------------------------------------------------

export type EmojiCategory =
  | 'people'
  | 'nature'
  | 'food'
  | 'activity'
  | 'travel'
  | 'objects'
  | 'symbols'
  | 'flags';

export interface EmojiEntry {
  emoji: string;
  name: string;
  keywords: string[];
  category: EmojiCategory;
}

// ---------------------------------------------------------------------------
// Curated emoji dataset (~390 commonly-used entries)
// ---------------------------------------------------------------------------

export const EMOJI_DATA: EmojiEntry[] = [
  // -------------------------------------------------------------------------
  // PEOPLE — faces, emotions, hand gestures, people
  // -------------------------------------------------------------------------
  { emoji: '😀', name: 'grinning face', keywords: ['smile', 'happy', 'joy'], category: 'people' },
  { emoji: '😃', name: 'smiley', keywords: ['happy', 'smile', 'face'], category: 'people' },
  { emoji: '😄', name: 'grinning face with smiling eyes', keywords: ['happy', 'smile', 'joy'], category: 'people' },
  { emoji: '😁', name: 'beaming face', keywords: ['grin', 'happy', 'smile'], category: 'people' },
  { emoji: '😆', name: 'squinting face', keywords: ['laugh', 'happy', 'lol', 'xd'], category: 'people' },
  { emoji: '😅', name: 'sweat smile', keywords: ['nervous', 'laugh', 'relief'], category: 'people' },
  { emoji: '🤣', name: 'rolling on floor laughing', keywords: ['lol', 'laugh', 'rofl'], category: 'people' },
  { emoji: '😂', name: 'tears of joy', keywords: ['laugh', 'cry', 'lol', 'funny'], category: 'people' },
  { emoji: '🙂', name: 'slightly smiling face', keywords: ['smile', 'ok', 'fine'], category: 'people' },
  { emoji: '🙃', name: 'upside down face', keywords: ['sarcasm', 'silly', 'irony'], category: 'people' },
  { emoji: '😉', name: 'winking face', keywords: ['wink', 'flirt', 'playful'], category: 'people' },
  { emoji: '😊', name: 'smiling face with smiling eyes', keywords: ['happy', 'blush', 'smile'], category: 'people' },
  { emoji: '😇', name: 'smiling face with halo', keywords: ['angel', 'innocent', 'good'], category: 'people' },
  { emoji: '🥰', name: 'smiling face with hearts', keywords: ['love', 'adore', 'crush'], category: 'people' },
  { emoji: '😍', name: 'heart eyes', keywords: ['love', 'crush', 'adore'], category: 'people' },
  { emoji: '🤩', name: 'star struck', keywords: ['wow', 'excited', 'star'], category: 'people' },
  { emoji: '😘', name: 'face blowing a kiss', keywords: ['kiss', 'love', 'flirt'], category: 'people' },
  { emoji: '😚', name: 'kissing face with closed eyes', keywords: ['kiss', 'love'], category: 'people' },
  { emoji: '🥲', name: 'smiling face with tear', keywords: ['grateful', 'sad', 'touched'], category: 'people' },
  { emoji: '😋', name: 'face savoring food', keywords: ['yummy', 'delicious', 'tasty'], category: 'people' },
  { emoji: '😛', name: 'face with tongue', keywords: ['tongue', 'silly', 'playful'], category: 'people' },
  { emoji: '😜', name: 'winking face with tongue', keywords: ['silly', 'wink', 'tongue', 'playful'], category: 'people' },
  { emoji: '🤪', name: 'zany face', keywords: ['crazy', 'wild', 'silly'], category: 'people' },
  { emoji: '😝', name: 'squinting face with tongue', keywords: ['tongue', 'silly', 'taste'], category: 'people' },
  { emoji: '🤑', name: 'money mouth face', keywords: ['money', 'rich', 'dollar'], category: 'people' },
  { emoji: '🤗', name: 'hugging face', keywords: ['hug', 'love', 'embrace'], category: 'people' },
  { emoji: '🤭', name: 'face with hand over mouth', keywords: ['oops', 'giggle', 'shy'], category: 'people' },
  { emoji: '🤫', name: 'shushing face', keywords: ['quiet', 'secret', 'shh'], category: 'people' },
  { emoji: '🤔', name: 'thinking face', keywords: ['think', 'hmm', 'consider'], category: 'people' },
  { emoji: '🤐', name: 'zipper mouth', keywords: ['secret', 'quiet', 'shut'], category: 'people' },
  { emoji: '🤨', name: 'raised eyebrow', keywords: ['skeptical', 'doubt', 'suspicious'], category: 'people' },
  { emoji: '😐', name: 'neutral face', keywords: ['meh', 'blank', 'indifferent'], category: 'people' },
  { emoji: '😶', name: 'face without mouth', keywords: ['silent', 'speechless', 'mute'], category: 'people' },
  { emoji: '😏', name: 'smirking face', keywords: ['smirk', 'flirt', 'sly'], category: 'people' },
  { emoji: '😒', name: 'unamused face', keywords: ['bored', 'annoyed', 'unimpressed'], category: 'people' },
  { emoji: '🙄', name: 'rolling eyes', keywords: ['annoyed', 'whatever', 'sigh'], category: 'people' },
  { emoji: '😬', name: 'grimacing face', keywords: ['awkward', 'nervous', 'cringe'], category: 'people' },
  { emoji: '🤥', name: 'lying face', keywords: ['lie', 'pinocchio', 'dishonest'], category: 'people' },
  { emoji: '😌', name: 'relieved face', keywords: ['relief', 'calm', 'peaceful'], category: 'people' },
  { emoji: '😔', name: 'pensive face', keywords: ['sad', 'thoughtful', 'down'], category: 'people' },
  { emoji: '😪', name: 'sleepy face', keywords: ['tired', 'sleep', 'exhausted'], category: 'people' },
  { emoji: '🤤', name: 'drooling face', keywords: ['drool', 'hungry', 'want'], category: 'people' },
  { emoji: '😴', name: 'sleeping face', keywords: ['sleep', 'zzz', 'tired'], category: 'people' },
  { emoji: '😷', name: 'face with medical mask', keywords: ['sick', 'mask', 'health'], category: 'people' },
  { emoji: '🤒', name: 'face with thermometer', keywords: ['sick', 'fever', 'ill'], category: 'people' },
  { emoji: '🤕', name: 'face with head bandage', keywords: ['hurt', 'injured', 'pain'], category: 'people' },
  { emoji: '🤢', name: 'nauseated face', keywords: ['sick', 'gross', 'nausea'], category: 'people' },
  { emoji: '🤮', name: 'vomiting face', keywords: ['sick', 'puke', 'gross'], category: 'people' },
  { emoji: '🥵', name: 'hot face', keywords: ['hot', 'heat', 'sweating'], category: 'people' },
  { emoji: '🥶', name: 'cold face', keywords: ['cold', 'freezing', 'ice'], category: 'people' },
  { emoji: '🥴', name: 'woozy face', keywords: ['dizzy', 'drunk', 'tipsy'], category: 'people' },
  { emoji: '🤯', name: 'exploding head', keywords: ['mind blown', 'shocked', 'wow'], category: 'people' },
  { emoji: '🤠', name: 'cowboy hat face', keywords: ['cowboy', 'western', 'yeehaw'], category: 'people' },
  { emoji: '🥳', name: 'partying face', keywords: ['party', 'celebrate', 'birthday'], category: 'people' },
  { emoji: '🥸', name: 'disguised face', keywords: ['disguise', 'incognito', 'spy'], category: 'people' },
  { emoji: '😎', name: 'sunglasses face', keywords: ['cool', 'sunglasses', 'chill'], category: 'people' },
  { emoji: '🤓', name: 'nerd face', keywords: ['nerd', 'geek', 'smart'], category: 'people' },
  { emoji: '🧐', name: 'monocle face', keywords: ['curious', 'inspect', 'investigate'], category: 'people' },
  { emoji: '😕', name: 'confused face', keywords: ['confused', 'unsure', 'puzzled'], category: 'people' },
  { emoji: '😟', name: 'worried face', keywords: ['worried', 'concern', 'anxious'], category: 'people' },
  { emoji: '🙁', name: 'slightly frowning face', keywords: ['sad', 'frown', 'unhappy'], category: 'people' },
  { emoji: '😮', name: 'face with open mouth', keywords: ['surprised', 'wow', 'shock'], category: 'people' },
  { emoji: '😲', name: 'astonished face', keywords: ['shocked', 'amazed', 'wow'], category: 'people' },
  { emoji: '😳', name: 'flushed face', keywords: ['embarrassed', 'blush', 'shy'], category: 'people' },
  { emoji: '🥺', name: 'pleading face', keywords: ['puppy eyes', 'please', 'beg'], category: 'people' },
  { emoji: '😨', name: 'fearful face', keywords: ['scared', 'fear', 'afraid'], category: 'people' },
  { emoji: '😰', name: 'anxious face with sweat', keywords: ['anxious', 'nervous', 'worried'], category: 'people' },
  { emoji: '😥', name: 'sad but relieved', keywords: ['sad', 'relief', 'disappointed'], category: 'people' },
  { emoji: '😢', name: 'crying face', keywords: ['cry', 'sad', 'tear'], category: 'people' },
  { emoji: '😭', name: 'loudly crying face', keywords: ['sob', 'cry', 'sad', 'bawl'], category: 'people' },
  { emoji: '😱', name: 'face screaming in fear', keywords: ['scream', 'horror', 'scared'], category: 'people' },
  { emoji: '😞', name: 'disappointed face', keywords: ['sad', 'disappointed', 'down'], category: 'people' },
  { emoji: '😩', name: 'weary face', keywords: ['tired', 'exhausted', 'fed up'], category: 'people' },
  { emoji: '🥱', name: 'yawning face', keywords: ['yawn', 'tired', 'bored'], category: 'people' },
  { emoji: '😤', name: 'face with steam from nose', keywords: ['angry', 'frustrated', 'triumph'], category: 'people' },
  { emoji: '😡', name: 'pouting face', keywords: ['angry', 'mad', 'rage'], category: 'people' },
  { emoji: '😠', name: 'angry face', keywords: ['angry', 'mad', 'grumpy'], category: 'people' },
  { emoji: '🤬', name: 'face with symbols on mouth', keywords: ['swearing', 'angry', 'censored'], category: 'people' },
  { emoji: '👿', name: 'angry face with horns', keywords: ['devil', 'evil', 'angry'], category: 'people' },
  { emoji: '😈', name: 'smiling face with horns', keywords: ['devil', 'evil', 'naughty'], category: 'people' },
  { emoji: '💀', name: 'skull', keywords: ['dead', 'death', 'skeleton'], category: 'people' },
  { emoji: '💩', name: 'pile of poo', keywords: ['poop', 'crap', 'shit'], category: 'people' },
  { emoji: '🤡', name: 'clown face', keywords: ['clown', 'funny', 'fool'], category: 'people' },
  { emoji: '👻', name: 'ghost', keywords: ['halloween', 'spooky', 'boo'], category: 'people' },
  { emoji: '👽', name: 'alien', keywords: ['ufo', 'space', 'extraterrestrial'], category: 'people' },
  { emoji: '🤖', name: 'robot', keywords: ['bot', 'machine', 'ai'], category: 'people' },

  // Hand gestures
  { emoji: '👋', name: 'waving hand', keywords: ['wave', 'hello', 'bye', 'hi'], category: 'people' },
  { emoji: '🖐️', name: 'hand with fingers splayed', keywords: ['hand', 'five', 'high five'], category: 'people' },
  { emoji: '✋', name: 'raised hand', keywords: ['hand', 'stop', 'high five'], category: 'people' },
  { emoji: '👌', name: 'ok hand', keywords: ['ok', 'perfect', 'good'], category: 'people' },
  { emoji: '🤌', name: 'pinched fingers', keywords: ['italian', 'chef kiss', 'perfect'], category: 'people' },
  { emoji: '🤏', name: 'pinching hand', keywords: ['small', 'tiny', 'little'], category: 'people' },
  { emoji: '✌️', name: 'victory hand', keywords: ['peace', 'two', 'victory'], category: 'people' },
  { emoji: '🤞', name: 'crossed fingers', keywords: ['luck', 'hope', 'wish'], category: 'people' },
  { emoji: '🤟', name: 'love you gesture', keywords: ['love', 'rock', 'hand'], category: 'people' },
  { emoji: '🤘', name: 'sign of the horns', keywords: ['rock', 'metal', 'horns'], category: 'people' },
  { emoji: '🤙', name: 'call me hand', keywords: ['call', 'shaka', 'hang loose'], category: 'people' },
  { emoji: '👈', name: 'backhand pointing left', keywords: ['left', 'point', 'direction'], category: 'people' },
  { emoji: '👉', name: 'backhand pointing right', keywords: ['right', 'point', 'direction'], category: 'people' },
  { emoji: '👆', name: 'backhand pointing up', keywords: ['up', 'point', 'above'], category: 'people' },
  { emoji: '👇', name: 'backhand pointing down', keywords: ['down', 'point', 'below'], category: 'people' },
  { emoji: '☝️', name: 'index pointing up', keywords: ['up', 'one', 'point'], category: 'people' },
  { emoji: '👍', name: 'thumbs up', keywords: ['like', 'approve', 'yes', 'good'], category: 'people' },
  { emoji: '👎', name: 'thumbs down', keywords: ['dislike', 'disapprove', 'no', 'bad'], category: 'people' },
  { emoji: '✊', name: 'raised fist', keywords: ['fist', 'power', 'punch'], category: 'people' },
  { emoji: '👊', name: 'fist bump', keywords: ['punch', 'fist', 'bump'], category: 'people' },
  { emoji: '👏', name: 'clapping hands', keywords: ['clap', 'applause', 'bravo'], category: 'people' },
  { emoji: '🙌', name: 'raising hands', keywords: ['celebrate', 'hooray', 'praise'], category: 'people' },
  { emoji: '🤝', name: 'handshake', keywords: ['deal', 'agree', 'partnership'], category: 'people' },
  { emoji: '🙏', name: 'folded hands', keywords: ['pray', 'please', 'thank you', 'hope'], category: 'people' },
  { emoji: '💪', name: 'flexed biceps', keywords: ['strong', 'muscle', 'power', 'flex'], category: 'people' },

  // Hearts
  { emoji: '❤️', name: 'red heart', keywords: ['love', 'heart', 'romance'], category: 'people' },
  { emoji: '🧡', name: 'orange heart', keywords: ['love', 'heart', 'orange'], category: 'people' },
  { emoji: '💛', name: 'yellow heart', keywords: ['love', 'heart', 'yellow'], category: 'people' },
  { emoji: '💚', name: 'green heart', keywords: ['love', 'heart', 'green'], category: 'people' },
  { emoji: '💙', name: 'blue heart', keywords: ['love', 'heart', 'blue'], category: 'people' },
  { emoji: '💜', name: 'purple heart', keywords: ['love', 'heart', 'purple'], category: 'people' },
  { emoji: '🖤', name: 'black heart', keywords: ['love', 'heart', 'dark'], category: 'people' },
  { emoji: '🤍', name: 'white heart', keywords: ['love', 'heart', 'pure'], category: 'people' },
  { emoji: '💔', name: 'broken heart', keywords: ['heartbreak', 'sad', 'breakup'], category: 'people' },
  { emoji: '💕', name: 'two hearts', keywords: ['love', 'hearts', 'romance'], category: 'people' },
  { emoji: '💖', name: 'sparkling heart', keywords: ['love', 'sparkle', 'heart'], category: 'people' },
  { emoji: '💘', name: 'heart with arrow', keywords: ['love', 'cupid', 'valentine'], category: 'people' },
  { emoji: '💝', name: 'heart with ribbon', keywords: ['love', 'gift', 'valentine'], category: 'people' },
  { emoji: '🔥', name: 'fire', keywords: ['hot', 'flame', 'lit', 'burn'], category: 'people' },
  { emoji: '💯', name: 'hundred points', keywords: ['perfect', 'score', 'hundred'], category: 'people' },
  { emoji: '💤', name: 'zzz', keywords: ['sleep', 'tired', 'snore'], category: 'people' },
  { emoji: '💬', name: 'speech balloon', keywords: ['chat', 'message', 'talk'], category: 'people' },
  { emoji: '💭', name: 'thought balloon', keywords: ['think', 'thought', 'idea'], category: 'people' },
  { emoji: '👀', name: 'eyes', keywords: ['look', 'see', 'watch', 'stare'], category: 'people' },
  { emoji: '🧠', name: 'brain', keywords: ['smart', 'think', 'mind'], category: 'people' },
  { emoji: '👶', name: 'baby', keywords: ['infant', 'child', 'newborn'], category: 'people' },
  { emoji: '👨', name: 'man', keywords: ['male', 'adult', 'guy'], category: 'people' },
  { emoji: '👩', name: 'woman', keywords: ['female', 'adult', 'lady'], category: 'people' },

  // -------------------------------------------------------------------------
  // NATURE — animals, plants, weather
  // -------------------------------------------------------------------------
  { emoji: '🐶', name: 'dog face', keywords: ['puppy', 'pet', 'woof'], category: 'nature' },
  { emoji: '🐱', name: 'cat face', keywords: ['kitten', 'pet', 'meow'], category: 'nature' },
  { emoji: '🐭', name: 'mouse face', keywords: ['rodent', 'pet', 'squeak'], category: 'nature' },
  { emoji: '🐹', name: 'hamster', keywords: ['pet', 'rodent', 'cute'], category: 'nature' },
  { emoji: '🐰', name: 'rabbit face', keywords: ['bunny', 'pet', 'easter'], category: 'nature' },
  { emoji: '🦊', name: 'fox', keywords: ['animal', 'clever', 'wild'], category: 'nature' },
  { emoji: '🐻', name: 'bear', keywords: ['animal', 'teddy', 'grizzly'], category: 'nature' },
  { emoji: '🐼', name: 'panda', keywords: ['bear', 'animal', 'cute'], category: 'nature' },
  { emoji: '🐨', name: 'koala', keywords: ['animal', 'australia', 'cute'], category: 'nature' },
  { emoji: '🐯', name: 'tiger face', keywords: ['animal', 'wild', 'cat'], category: 'nature' },
  { emoji: '🦁', name: 'lion', keywords: ['animal', 'king', 'wild'], category: 'nature' },
  { emoji: '🐮', name: 'cow face', keywords: ['animal', 'farm', 'moo'], category: 'nature' },
  { emoji: '🐷', name: 'pig face', keywords: ['animal', 'farm', 'oink'], category: 'nature' },
  { emoji: '🐸', name: 'frog', keywords: ['toad', 'animal', 'ribbit'], category: 'nature' },
  { emoji: '🐵', name: 'monkey face', keywords: ['animal', 'primate', 'ape'], category: 'nature' },
  { emoji: '🙈', name: 'see no evil monkey', keywords: ['monkey', 'shy', 'hide'], category: 'nature' },
  { emoji: '🙉', name: 'hear no evil monkey', keywords: ['monkey', 'ignore', 'deaf'], category: 'nature' },
  { emoji: '🙊', name: 'speak no evil monkey', keywords: ['monkey', 'quiet', 'oops'], category: 'nature' },
  { emoji: '🐔', name: 'chicken', keywords: ['bird', 'farm', 'hen'], category: 'nature' },
  { emoji: '🐧', name: 'penguin', keywords: ['bird', 'arctic', 'cold'], category: 'nature' },
  { emoji: '🐦', name: 'bird', keywords: ['animal', 'tweet', 'fly'], category: 'nature' },
  { emoji: '🦅', name: 'eagle', keywords: ['bird', 'america', 'freedom'], category: 'nature' },
  { emoji: '🦆', name: 'duck', keywords: ['bird', 'quack', 'water'], category: 'nature' },
  { emoji: '🦉', name: 'owl', keywords: ['bird', 'wise', 'night'], category: 'nature' },
  { emoji: '🐴', name: 'horse face', keywords: ['animal', 'pony', 'ride'], category: 'nature' },
  { emoji: '🦄', name: 'unicorn', keywords: ['magic', 'fantasy', 'horse'], category: 'nature' },
  { emoji: '🐝', name: 'honeybee', keywords: ['bee', 'insect', 'honey'], category: 'nature' },
  { emoji: '🦋', name: 'butterfly', keywords: ['insect', 'nature', 'pretty'], category: 'nature' },
  { emoji: '🐙', name: 'octopus', keywords: ['sea', 'tentacle', 'ocean'], category: 'nature' },
  { emoji: '🐟', name: 'fish', keywords: ['sea', 'ocean', 'swim'], category: 'nature' },
  { emoji: '🐬', name: 'dolphin', keywords: ['sea', 'ocean', 'smart'], category: 'nature' },
  { emoji: '🐳', name: 'spouting whale', keywords: ['whale', 'ocean', 'sea'], category: 'nature' },
  { emoji: '🦈', name: 'shark', keywords: ['fish', 'ocean', 'danger'], category: 'nature' },
  { emoji: '🐢', name: 'turtle', keywords: ['slow', 'reptile', 'shell'], category: 'nature' },
  { emoji: '🐍', name: 'snake', keywords: ['reptile', 'slither', 'danger'], category: 'nature' },
  { emoji: '🦖', name: 'dinosaur', keywords: ['trex', 'extinct', 'jurassic'], category: 'nature' },

  // Plants & weather
  { emoji: '🌸', name: 'cherry blossom', keywords: ['flower', 'spring', 'sakura'], category: 'nature' },
  { emoji: '🌹', name: 'rose', keywords: ['flower', 'love', 'romance'], category: 'nature' },
  { emoji: '🌻', name: 'sunflower', keywords: ['flower', 'sun', 'yellow'], category: 'nature' },
  { emoji: '🌺', name: 'hibiscus', keywords: ['flower', 'tropical', 'hawaii'], category: 'nature' },
  { emoji: '🌷', name: 'tulip', keywords: ['flower', 'spring', 'bloom'], category: 'nature' },
  { emoji: '🌱', name: 'seedling', keywords: ['plant', 'grow', 'sprout'], category: 'nature' },
  { emoji: '🌲', name: 'evergreen tree', keywords: ['tree', 'pine', 'nature'], category: 'nature' },
  { emoji: '🌴', name: 'palm tree', keywords: ['tropical', 'beach', 'vacation'], category: 'nature' },
  { emoji: '🍀', name: 'four leaf clover', keywords: ['luck', 'irish', 'clover'], category: 'nature' },
  { emoji: '🍁', name: 'maple leaf', keywords: ['fall', 'autumn', 'canada'], category: 'nature' },
  { emoji: '🌍', name: 'globe europe africa', keywords: ['earth', 'world', 'planet'], category: 'nature' },
  { emoji: '🌎', name: 'globe americas', keywords: ['earth', 'world', 'planet'], category: 'nature' },
  { emoji: '🌙', name: 'crescent moon', keywords: ['moon', 'night', 'sleep'], category: 'nature' },
  { emoji: '⭐', name: 'star', keywords: ['night', 'sky', 'favorite'], category: 'nature' },
  { emoji: '🌟', name: 'glowing star', keywords: ['sparkle', 'shine', 'star'], category: 'nature' },
  { emoji: '✨', name: 'sparkles', keywords: ['sparkle', 'shine', 'magic', 'clean'], category: 'nature' },
  { emoji: '⚡', name: 'high voltage', keywords: ['lightning', 'electric', 'zap', 'thunder'], category: 'nature' },
  { emoji: '☀️', name: 'sun', keywords: ['sunny', 'bright', 'weather'], category: 'nature' },
  { emoji: '⛅', name: 'sun behind cloud', keywords: ['weather', 'cloudy', 'partly'], category: 'nature' },
  { emoji: '☁️', name: 'cloud', keywords: ['weather', 'cloudy', 'sky'], category: 'nature' },
  { emoji: '🌧️', name: 'cloud with rain', keywords: ['rain', 'weather', 'storm'], category: 'nature' },
  { emoji: '⛈️', name: 'cloud with lightning and rain', keywords: ['storm', 'thunder', 'weather'], category: 'nature' },
  { emoji: '❄️', name: 'snowflake', keywords: ['snow', 'cold', 'winter', 'ice'], category: 'nature' },
  { emoji: '🌈', name: 'rainbow', keywords: ['weather', 'colorful', 'pride'], category: 'nature' },
  { emoji: '🌊', name: 'water wave', keywords: ['ocean', 'sea', 'surf', 'wave'], category: 'nature' },

  // -------------------------------------------------------------------------
  // FOOD — food and drink
  // -------------------------------------------------------------------------
  { emoji: '🍎', name: 'red apple', keywords: ['fruit', 'healthy', 'teacher'], category: 'food' },
  { emoji: '🍊', name: 'tangerine', keywords: ['orange', 'fruit', 'citrus'], category: 'food' },
  { emoji: '🍋', name: 'lemon', keywords: ['fruit', 'citrus', 'sour'], category: 'food' },
  { emoji: '🍌', name: 'banana', keywords: ['fruit', 'monkey', 'yellow'], category: 'food' },
  { emoji: '🍉', name: 'watermelon', keywords: ['fruit', 'summer', 'melon'], category: 'food' },
  { emoji: '🍇', name: 'grapes', keywords: ['fruit', 'wine', 'purple'], category: 'food' },
  { emoji: '🍓', name: 'strawberry', keywords: ['fruit', 'berry', 'red'], category: 'food' },
  { emoji: '🫐', name: 'blueberries', keywords: ['fruit', 'berry', 'blue'], category: 'food' },
  { emoji: '🍑', name: 'peach', keywords: ['fruit', 'butt', 'fuzzy'], category: 'food' },
  { emoji: '🥑', name: 'avocado', keywords: ['fruit', 'guacamole', 'green'], category: 'food' },
  { emoji: '🍅', name: 'tomato', keywords: ['vegetable', 'red', 'salad'], category: 'food' },
  { emoji: '🥕', name: 'carrot', keywords: ['vegetable', 'orange', 'bunny'], category: 'food' },
  { emoji: '🌽', name: 'ear of corn', keywords: ['corn', 'vegetable', 'farm'], category: 'food' },
  { emoji: '🌶️', name: 'hot pepper', keywords: ['spicy', 'chili', 'hot'], category: 'food' },
  { emoji: '🥦', name: 'broccoli', keywords: ['vegetable', 'green', 'healthy'], category: 'food' },
  { emoji: '🧄', name: 'garlic', keywords: ['vegetable', 'cooking', 'flavor'], category: 'food' },
  { emoji: '🍞', name: 'bread', keywords: ['food', 'loaf', 'toast'], category: 'food' },
  { emoji: '🥐', name: 'croissant', keywords: ['bread', 'french', 'pastry'], category: 'food' },
  { emoji: '🍕', name: 'pizza', keywords: ['food', 'slice', 'italian'], category: 'food' },
  { emoji: '🍔', name: 'hamburger', keywords: ['burger', 'food', 'fast food'], category: 'food' },
  { emoji: '🍟', name: 'french fries', keywords: ['fries', 'food', 'fast food'], category: 'food' },
  { emoji: '🌭', name: 'hot dog', keywords: ['food', 'sausage', 'fast food'], category: 'food' },
  { emoji: '🥪', name: 'sandwich', keywords: ['food', 'lunch', 'bread'], category: 'food' },
  { emoji: '🌮', name: 'taco', keywords: ['food', 'mexican', 'tuesday'], category: 'food' },
  { emoji: '🌯', name: 'burrito', keywords: ['food', 'mexican', 'wrap'], category: 'food' },
  { emoji: '🥗', name: 'salad', keywords: ['food', 'healthy', 'green'], category: 'food' },
  { emoji: '🍝', name: 'spaghetti', keywords: ['pasta', 'food', 'italian'], category: 'food' },
  { emoji: '🍜', name: 'steaming bowl', keywords: ['noodles', 'ramen', 'soup'], category: 'food' },
  { emoji: '🍣', name: 'sushi', keywords: ['food', 'japanese', 'fish'], category: 'food' },
  { emoji: '🍱', name: 'bento box', keywords: ['food', 'japanese', 'lunch'], category: 'food' },
  { emoji: '🍛', name: 'curry rice', keywords: ['food', 'indian', 'spicy'], category: 'food' },
  { emoji: '🍗', name: 'poultry leg', keywords: ['chicken', 'food', 'meat'], category: 'food' },
  { emoji: '🥩', name: 'cut of meat', keywords: ['steak', 'food', 'beef'], category: 'food' },
  { emoji: '🍳', name: 'cooking', keywords: ['egg', 'frying', 'breakfast'], category: 'food' },
  { emoji: '🧁', name: 'cupcake', keywords: ['dessert', 'cake', 'sweet'], category: 'food' },
  { emoji: '🎂', name: 'birthday cake', keywords: ['cake', 'birthday', 'party'], category: 'food' },
  { emoji: '🍰', name: 'shortcake', keywords: ['cake', 'dessert', 'sweet'], category: 'food' },
  { emoji: '🍩', name: 'doughnut', keywords: ['donut', 'dessert', 'sweet'], category: 'food' },
  { emoji: '🍪', name: 'cookie', keywords: ['dessert', 'sweet', 'biscuit'], category: 'food' },
  { emoji: '🍫', name: 'chocolate bar', keywords: ['candy', 'sweet', 'dessert'], category: 'food' },
  { emoji: '🍬', name: 'candy', keywords: ['sweet', 'sugar', 'treat'], category: 'food' },
  { emoji: '🍦', name: 'soft ice cream', keywords: ['ice cream', 'dessert', 'cone'], category: 'food' },
  { emoji: '☕', name: 'hot beverage', keywords: ['coffee', 'tea', 'drink'], category: 'food' },
  { emoji: '🍵', name: 'teacup', keywords: ['tea', 'drink', 'hot'], category: 'food' },
  { emoji: '🧃', name: 'beverage box', keywords: ['juice', 'drink', 'box'], category: 'food' },
  { emoji: '🍺', name: 'beer mug', keywords: ['beer', 'drink', 'alcohol'], category: 'food' },
  { emoji: '🍻', name: 'clinking beer mugs', keywords: ['beer', 'cheers', 'drink'], category: 'food' },
  { emoji: '🥂', name: 'clinking glasses', keywords: ['champagne', 'cheers', 'toast'], category: 'food' },
  { emoji: '🍷', name: 'wine glass', keywords: ['wine', 'drink', 'alcohol'], category: 'food' },
  { emoji: '🥤', name: 'cup with straw', keywords: ['soda', 'drink', 'beverage'], category: 'food' },

  // -------------------------------------------------------------------------
  // ACTIVITY — sports, games, hobbies
  // -------------------------------------------------------------------------
  { emoji: '⚽', name: 'soccer ball', keywords: ['football', 'sport', 'ball'], category: 'activity' },
  { emoji: '🏀', name: 'basketball', keywords: ['sport', 'ball', 'nba'], category: 'activity' },
  { emoji: '🏈', name: 'american football', keywords: ['sport', 'ball', 'nfl'], category: 'activity' },
  { emoji: '⚾', name: 'baseball', keywords: ['sport', 'ball', 'mlb'], category: 'activity' },
  { emoji: '🎾', name: 'tennis', keywords: ['sport', 'ball', 'racket'], category: 'activity' },
  { emoji: '🏐', name: 'volleyball', keywords: ['sport', 'ball', 'beach'], category: 'activity' },
  { emoji: '🏓', name: 'ping pong', keywords: ['table tennis', 'sport', 'paddle'], category: 'activity' },
  { emoji: '🎱', name: 'pool 8 ball', keywords: ['billiards', 'game', 'pool'], category: 'activity' },
  { emoji: '🏆', name: 'trophy', keywords: ['win', 'award', 'champion'], category: 'activity' },
  { emoji: '🥇', name: 'gold medal', keywords: ['first', 'win', 'champion'], category: 'activity' },
  { emoji: '🥈', name: 'silver medal', keywords: ['second', 'runner up'], category: 'activity' },
  { emoji: '🥉', name: 'bronze medal', keywords: ['third', 'place'], category: 'activity' },
  { emoji: '🎯', name: 'bullseye', keywords: ['target', 'dart', 'goal'], category: 'activity' },
  { emoji: '🎮', name: 'video game', keywords: ['gaming', 'controller', 'play'], category: 'activity' },
  { emoji: '🕹️', name: 'joystick', keywords: ['gaming', 'arcade', 'play'], category: 'activity' },
  { emoji: '🎲', name: 'game die', keywords: ['dice', 'game', 'random'], category: 'activity' },
  { emoji: '🎭', name: 'performing arts', keywords: ['theater', 'drama', 'masks'], category: 'activity' },
  { emoji: '🎨', name: 'artist palette', keywords: ['art', 'paint', 'creative'], category: 'activity' },
  { emoji: '🎬', name: 'clapper board', keywords: ['movie', 'film', 'action'], category: 'activity' },
  { emoji: '🎤', name: 'microphone', keywords: ['sing', 'karaoke', 'mic'], category: 'activity' },
  { emoji: '🎧', name: 'headphone', keywords: ['music', 'listen', 'audio'], category: 'activity' },
  { emoji: '🎵', name: 'musical note', keywords: ['music', 'song', 'melody'], category: 'activity' },
  { emoji: '🎶', name: 'musical notes', keywords: ['music', 'song', 'melody'], category: 'activity' },
  { emoji: '🎹', name: 'musical keyboard', keywords: ['piano', 'music', 'keys'], category: 'activity' },
  { emoji: '🎸', name: 'guitar', keywords: ['music', 'rock', 'instrument'], category: 'activity' },
  { emoji: '🎺', name: 'trumpet', keywords: ['music', 'brass', 'instrument'], category: 'activity' },
  { emoji: '🥁', name: 'drum', keywords: ['music', 'percussion', 'beat'], category: 'activity' },
  { emoji: '🎪', name: 'circus tent', keywords: ['circus', 'carnival', 'show'], category: 'activity' },

  // -------------------------------------------------------------------------
  // TRAVEL — places, transport, buildings
  // -------------------------------------------------------------------------
  { emoji: '🚗', name: 'car', keywords: ['automobile', 'drive', 'vehicle'], category: 'travel' },
  { emoji: '🚕', name: 'taxi', keywords: ['cab', 'car', 'ride'], category: 'travel' },
  { emoji: '🚌', name: 'bus', keywords: ['transit', 'vehicle', 'public'], category: 'travel' },
  { emoji: '🚑', name: 'ambulance', keywords: ['emergency', 'hospital', 'health'], category: 'travel' },
  { emoji: '🚒', name: 'fire engine', keywords: ['fire', 'emergency', 'truck'], category: 'travel' },
  { emoji: '🚲', name: 'bicycle', keywords: ['bike', 'ride', 'cycle'], category: 'travel' },
  { emoji: '✈️', name: 'airplane', keywords: ['fly', 'travel', 'flight'], category: 'travel' },
  { emoji: '🚀', name: 'rocket', keywords: ['space', 'launch', 'ship'], category: 'travel' },
  { emoji: '🛳️', name: 'passenger ship', keywords: ['cruise', 'boat', 'travel'], category: 'travel' },
  { emoji: '⛵', name: 'sailboat', keywords: ['boat', 'sail', 'sea'], category: 'travel' },
  { emoji: '🚂', name: 'locomotive', keywords: ['train', 'steam', 'railway'], category: 'travel' },
  { emoji: '🏠', name: 'house', keywords: ['home', 'building', 'residence'], category: 'travel' },
  { emoji: '🏢', name: 'office building', keywords: ['work', 'building', 'business'], category: 'travel' },
  { emoji: '🏥', name: 'hospital', keywords: ['health', 'building', 'medical'], category: 'travel' },
  { emoji: '🏫', name: 'school', keywords: ['education', 'building', 'learn'], category: 'travel' },
  { emoji: '🏰', name: 'castle', keywords: ['building', 'royal', 'medieval'], category: 'travel' },
  { emoji: '⛪', name: 'church', keywords: ['religion', 'building', 'christian'], category: 'travel' },
  { emoji: '🗽', name: 'statue of liberty', keywords: ['america', 'new york', 'landmark'], category: 'travel' },
  { emoji: '🏖️', name: 'beach with umbrella', keywords: ['beach', 'vacation', 'summer'], category: 'travel' },
  { emoji: '🏔️', name: 'snow capped mountain', keywords: ['mountain', 'nature', 'cold'], category: 'travel' },
  { emoji: '⛰️', name: 'mountain', keywords: ['nature', 'hike', 'hill'], category: 'travel' },

  // -------------------------------------------------------------------------
  // OBJECTS — tools, tech, everyday items
  // -------------------------------------------------------------------------
  { emoji: '⌚', name: 'watch', keywords: ['time', 'clock', 'wrist'], category: 'objects' },
  { emoji: '📱', name: 'mobile phone', keywords: ['phone', 'cell', 'smartphone'], category: 'objects' },
  { emoji: '💻', name: 'laptop', keywords: ['computer', 'pc', 'mac'], category: 'objects' },
  { emoji: '⌨️', name: 'keyboard', keywords: ['type', 'computer', 'input'], category: 'objects' },
  { emoji: '🖥️', name: 'desktop computer', keywords: ['pc', 'monitor', 'screen'], category: 'objects' },
  { emoji: '📷', name: 'camera', keywords: ['photo', 'picture', 'snap'], category: 'objects' },
  { emoji: '📹', name: 'video camera', keywords: ['video', 'film', 'record'], category: 'objects' },
  { emoji: '📺', name: 'television', keywords: ['tv', 'screen', 'watch'], category: 'objects' },
  { emoji: '🔊', name: 'speaker high volume', keywords: ['sound', 'loud', 'audio'], category: 'objects' },
  { emoji: '🔔', name: 'bell', keywords: ['notification', 'ring', 'alert'], category: 'objects' },
  { emoji: '📞', name: 'telephone receiver', keywords: ['phone', 'call', 'ring'], category: 'objects' },
  { emoji: '🔋', name: 'battery', keywords: ['power', 'charge', 'energy'], category: 'objects' },
  { emoji: '🔌', name: 'electric plug', keywords: ['power', 'charge', 'outlet'], category: 'objects' },
  { emoji: '💡', name: 'light bulb', keywords: ['idea', 'light', 'bright'], category: 'objects' },
  { emoji: '📦', name: 'package', keywords: ['box', 'shipping', 'delivery'], category: 'objects' },
  { emoji: '💰', name: 'money bag', keywords: ['money', 'dollar', 'rich'], category: 'objects' },
  { emoji: '💵', name: 'dollar banknote', keywords: ['money', 'cash', 'dollar'], category: 'objects' },
  { emoji: '💳', name: 'credit card', keywords: ['payment', 'money', 'card'], category: 'objects' },
  { emoji: '✉️', name: 'envelope', keywords: ['mail', 'letter', 'email'], category: 'objects' },
  { emoji: '📧', name: 'email', keywords: ['mail', 'message', 'inbox'], category: 'objects' },
  { emoji: '📝', name: 'memo', keywords: ['note', 'write', 'pencil'], category: 'objects' },
  { emoji: '📁', name: 'file folder', keywords: ['folder', 'directory', 'files'], category: 'objects' },
  { emoji: '📅', name: 'calendar', keywords: ['date', 'schedule', 'plan'], category: 'objects' },
  { emoji: '📌', name: 'pushpin', keywords: ['pin', 'location', 'mark'], category: 'objects' },
  { emoji: '📎', name: 'paperclip', keywords: ['attach', 'clip', 'office'], category: 'objects' },
  { emoji: '✏️', name: 'pencil', keywords: ['write', 'draw', 'edit'], category: 'objects' },
  { emoji: '🖊️', name: 'pen', keywords: ['write', 'ink', 'sign'], category: 'objects' },
  { emoji: '📚', name: 'books', keywords: ['read', 'study', 'library'], category: 'objects' },
  { emoji: '📖', name: 'open book', keywords: ['read', 'study', 'page'], category: 'objects' },
  { emoji: '🔗', name: 'link', keywords: ['chain', 'url', 'connect'], category: 'objects' },
  { emoji: '🔒', name: 'locked', keywords: ['lock', 'security', 'private'], category: 'objects' },
  { emoji: '🔓', name: 'unlocked', keywords: ['lock', 'open', 'security'], category: 'objects' },
  { emoji: '🔑', name: 'key', keywords: ['lock', 'password', 'access'], category: 'objects' },
  { emoji: '🔨', name: 'hammer', keywords: ['tool', 'build', 'fix'], category: 'objects' },
  { emoji: '🔧', name: 'wrench', keywords: ['tool', 'fix', 'repair'], category: 'objects' },
  { emoji: '⚙️', name: 'gear', keywords: ['settings', 'config', 'mechanical'], category: 'objects' },
  { emoji: '💊', name: 'pill', keywords: ['medicine', 'drug', 'health'], category: 'objects' },
  { emoji: '🧪', name: 'test tube', keywords: ['science', 'experiment', 'lab'], category: 'objects' },
  { emoji: '🔬', name: 'microscope', keywords: ['science', 'lab', 'research'], category: 'objects' },
  { emoji: '🎁', name: 'wrapped gift', keywords: ['present', 'birthday', 'gift'], category: 'objects' },
  { emoji: '🎈', name: 'balloon', keywords: ['party', 'birthday', 'celebrate'], category: 'objects' },
  { emoji: '🎉', name: 'party popper', keywords: ['celebrate', 'party', 'congratulations', 'tada'], category: 'objects' },
  { emoji: '🎊', name: 'confetti ball', keywords: ['celebrate', 'party', 'congratulations'], category: 'objects' },
  { emoji: '🏷️', name: 'label', keywords: ['tag', 'price', 'sale'], category: 'objects' },
  { emoji: '🛒', name: 'shopping cart', keywords: ['shop', 'buy', 'store'], category: 'objects' },

  // -------------------------------------------------------------------------
  // SYMBOLS — signs, arrows, marks
  // -------------------------------------------------------------------------
  { emoji: '❤️‍🔥', name: 'heart on fire', keywords: ['love', 'passion', 'burning'], category: 'symbols' },
  { emoji: '✅', name: 'check mark button', keywords: ['done', 'complete', 'yes'], category: 'symbols' },
  { emoji: '❌', name: 'cross mark', keywords: ['no', 'wrong', 'delete'], category: 'symbols' },
  { emoji: '⭕', name: 'hollow red circle', keywords: ['circle', 'ring', 'round'], category: 'symbols' },
  { emoji: '❗', name: 'exclamation mark', keywords: ['alert', 'warning', 'important'], category: 'symbols' },
  { emoji: '❓', name: 'question mark', keywords: ['question', 'help', 'what'], category: 'symbols' },
  { emoji: '‼️', name: 'double exclamation', keywords: ['alert', 'urgent', 'important'], category: 'symbols' },
  { emoji: '⚠️', name: 'warning', keywords: ['caution', 'alert', 'danger'], category: 'symbols' },
  { emoji: '🚫', name: 'prohibited', keywords: ['no', 'forbidden', 'stop'], category: 'symbols' },
  { emoji: '🔴', name: 'red circle', keywords: ['red', 'dot', 'circle'], category: 'symbols' },
  { emoji: '🟢', name: 'green circle', keywords: ['green', 'dot', 'circle'], category: 'symbols' },
  { emoji: '🔵', name: 'blue circle', keywords: ['blue', 'dot', 'circle'], category: 'symbols' },
  { emoji: '🟡', name: 'yellow circle', keywords: ['yellow', 'dot', 'circle'], category: 'symbols' },
  { emoji: '🟠', name: 'orange circle', keywords: ['orange', 'dot', 'circle'], category: 'symbols' },
  { emoji: '🟣', name: 'purple circle', keywords: ['purple', 'dot', 'circle'], category: 'symbols' },
  { emoji: '➕', name: 'plus', keywords: ['add', 'plus', 'positive'], category: 'symbols' },
  { emoji: '➖', name: 'minus', keywords: ['subtract', 'minus', 'negative'], category: 'symbols' },
  { emoji: '➡️', name: 'right arrow', keywords: ['arrow', 'right', 'next'], category: 'symbols' },
  { emoji: '⬅️', name: 'left arrow', keywords: ['arrow', 'left', 'back'], category: 'symbols' },
  { emoji: '⬆️', name: 'up arrow', keywords: ['arrow', 'up', 'above'], category: 'symbols' },
  { emoji: '⬇️', name: 'down arrow', keywords: ['arrow', 'down', 'below'], category: 'symbols' },
  { emoji: '↩️', name: 'right arrow curving left', keywords: ['return', 'back', 'undo'], category: 'symbols' },
  { emoji: '🔄', name: 'counterclockwise arrows', keywords: ['refresh', 'reload', 'sync'], category: 'symbols' },
  { emoji: 'ℹ️', name: 'information', keywords: ['info', 'help', 'about'], category: 'symbols' },
  { emoji: '♻️', name: 'recycling symbol', keywords: ['recycle', 'environment', 'green'], category: 'symbols' },
  { emoji: '🏳️‍🌈', name: 'rainbow flag', keywords: ['pride', 'lgbtq', 'rainbow'], category: 'symbols' },
  { emoji: '⚡', name: 'zap', keywords: ['lightning', 'fast', 'electric'], category: 'symbols' },

  // -------------------------------------------------------------------------
  // FLAGS — major countries
  // -------------------------------------------------------------------------
  { emoji: '🇺🇸', name: 'flag united states', keywords: ['usa', 'america', 'us'], category: 'flags' },
  { emoji: '🇬🇧', name: 'flag united kingdom', keywords: ['uk', 'britain', 'england'], category: 'flags' },
  { emoji: '🇨🇦', name: 'flag canada', keywords: ['canada', 'maple'], category: 'flags' },
  { emoji: '🇦🇺', name: 'flag australia', keywords: ['australia', 'aussie'], category: 'flags' },
  { emoji: '🇫🇷', name: 'flag france', keywords: ['france', 'french'], category: 'flags' },
  { emoji: '🇩🇪', name: 'flag germany', keywords: ['germany', 'german'], category: 'flags' },
  { emoji: '🇮🇹', name: 'flag italy', keywords: ['italy', 'italian'], category: 'flags' },
  { emoji: '🇪🇸', name: 'flag spain', keywords: ['spain', 'spanish'], category: 'flags' },
  { emoji: '🇯🇵', name: 'flag japan', keywords: ['japan', 'japanese'], category: 'flags' },
  { emoji: '🇨🇳', name: 'flag china', keywords: ['china', 'chinese'], category: 'flags' },
  { emoji: '🇰🇷', name: 'flag south korea', keywords: ['korea', 'korean'], category: 'flags' },
  { emoji: '🇮🇳', name: 'flag india', keywords: ['india', 'indian'], category: 'flags' },
  { emoji: '🇧🇷', name: 'flag brazil', keywords: ['brazil', 'brazilian'], category: 'flags' },
  { emoji: '🇲🇽', name: 'flag mexico', keywords: ['mexico', 'mexican'], category: 'flags' },
  { emoji: '🇷🇺', name: 'flag russia', keywords: ['russia', 'russian'], category: 'flags' },
  { emoji: '🇿🇦', name: 'flag south africa', keywords: ['south africa', 'african'], category: 'flags' },
  { emoji: '🇳🇱', name: 'flag netherlands', keywords: ['netherlands', 'dutch'], category: 'flags' },
  { emoji: '🇨🇭', name: 'flag switzerland', keywords: ['switzerland', 'swiss'], category: 'flags' },
  { emoji: '🇮🇪', name: 'flag ireland', keywords: ['ireland', 'irish'], category: 'flags' },
  { emoji: '🇹🇷', name: 'flag turkey', keywords: ['turkey', 'turkish'], category: 'flags' },
  { emoji: '🇸🇦', name: 'flag saudi arabia', keywords: ['saudi', 'arabia'], category: 'flags' },
];

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Search emoji by name and keywords. Name matches rank above keyword-only matches.
 * Uses lowercase prefix matching on both name words and keywords.
 */
export function searchEmoji(query: string, limit = 8): EmojiEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const nameMatches: EmojiEntry[] = [];
  const keywordOnlyMatches: EmojiEntry[] = [];

  for (const entry of EMOJI_DATA) {
    const nameWords = entry.name.toLowerCase().split(/\s+/);
    const nameMatch = nameWords.some((w) => w.startsWith(q));

    if (nameMatch) {
      nameMatches.push(entry);
    } else {
      const keywordMatch = entry.keywords.some((kw) => kw.toLowerCase().startsWith(q));
      if (keywordMatch) {
        keywordOnlyMatches.push(entry);
      }
    }

    // Early exit if we already have enough name matches
    if (nameMatches.length >= limit && keywordOnlyMatches.length >= limit) break;
  }

  return [...nameMatches, ...keywordOnlyMatches].slice(0, limit);
}

// ---------------------------------------------------------------------------
// Category grouping (memoized)
// ---------------------------------------------------------------------------

let _categoryCache: Record<EmojiCategory, EmojiEntry[]> | null = null;

/**
 * Returns all emoji grouped by category. Result is memoized after first call.
 */
export function getEmojiByCategory(): Record<EmojiCategory, EmojiEntry[]> {
  if (_categoryCache) return _categoryCache;

  _categoryCache = {
    people: [],
    nature: [],
    food: [],
    activity: [],
    travel: [],
    objects: [],
    symbols: [],
    flags: [],
  };

  for (const entry of EMOJI_DATA) {
    _categoryCache[entry.category].push(entry);
  }

  return _categoryCache;
}

// ---------------------------------------------------------------------------
// Shortcodes
// ---------------------------------------------------------------------------

export const EMOJI_SHORTCODES: Record<string, string> = {
  ':)': '😊',
  ':(': '😞',
  ';)': '😉',
  ':D': '😁',
  ':P': '😛',
  ':O': '😮',
  '<3': '❤️',
  ':/': '😕',
  ":'(": '😢',
  'XD': '😆',
  ':*': '😘',
  'B)': '😎',
};

/** Length of the longest shortcode key, useful for efficient prefix checking. */
export const MAX_SHORTCODE_LENGTH: number = Math.max(
  ...Object.keys(EMOJI_SHORTCODES).map((k) => k.length)
);
