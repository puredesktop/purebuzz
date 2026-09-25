/**
 * A curated emoji table — enough for chat, small enough to ship inline.
 * Names double as :shortcodes: (Slack/GitHub vocabulary where one exists),
 * keywords widen search. Emoji are plain Unicode; the relay never cares.
 */

export interface EmojiEntry {
  char: string
  name: string
  keywords: string
}

const E = (char: string, name: string, keywords = ''): EmojiEntry => ({
  char,
  name,
  keywords,
})

export const EMOJI: EmojiEntry[] = [
  E('👍', 'thumbsup', 'yes ok approve +1'),
  E('👎', 'thumbsdown', 'no -1'),
  E('❤️', 'heart', 'love'),
  E('😂', 'joy', 'laugh lol funny tears'),
  E('🎉', 'tada', 'party celebrate'),
  E('🔥', 'fire', 'hot lit'),
  E('🚀', 'rocket', 'ship launch'),
  E('👀', 'eyes', 'look watching'),
  E('🙏', 'pray', 'thanks please'),
  E('👏', 'clap', 'applause bravo'),
  E('😄', 'smile', 'happy grin'),
  E('😊', 'blush', 'happy'),
  E('😉', 'wink', ''),
  E('😅', 'sweat_smile', 'phew'),
  E('🤣', 'rofl', 'laugh floor'),
  E('🙂', 'slightly_smiling_face', ''),
  E('😍', 'heart_eyes', 'love'),
  E('😎', 'sunglasses', 'cool'),
  E('🤔', 'thinking', 'hmm'),
  E('😐', 'neutral_face', 'meh'),
  E('😴', 'sleeping', 'tired zzz'),
  E('😢', 'cry', 'sad tear'),
  E('😭', 'sob', 'crying'),
  E('😡', 'rage', 'angry mad'),
  E('🤯', 'exploding_head', 'mind blown'),
  E('😱', 'scream', 'shock'),
  E('🥳', 'partying_face', 'celebrate birthday'),
  E('🤗', 'hugs', 'hug'),
  E('🤫', 'shushing_face', 'quiet secret'),
  E('🙄', 'roll_eyes', 'eyeroll'),
  E('😬', 'grimacing', 'awkward'),
  E('🤷', 'shrug', 'dunno'),
  E('💪', 'muscle', 'strong flex'),
  E('🤝', 'handshake', 'deal agree'),
  E('✌️', 'v', 'peace victory'),
  E('🤞', 'crossed_fingers', 'luck hope'),
  E('👋', 'wave', 'hello bye hi'),
  E('✋', 'raised_hand', 'stop high five'),
  E('👌', 'ok_hand', 'okay'),
  E('☝️', 'point_up', ''),
  E('👉', 'point_right', ''),
  E('🧠', 'brain', 'smart'),
  E('🤑', 'money_mouth_face', 'rich'),
  E('✅', 'white_check_mark', 'done check yes'),
  E('❌', 'x', 'no cross wrong'),
  E('⚠️', 'warning', 'caution'),
  E('❓', 'question', 'what'),
  E('❗', 'exclamation', 'important'),
  E('✔️', 'heavy_check_mark', 'check'),
  E('⭐', 'star', 'favorite'),
  E('✨', 'sparkles', 'shiny new magic'),
  E('💡', 'bulb', 'idea light'),
  E('📌', 'pushpin', 'pin'),
  E('📎', 'paperclip', 'attach'),
  E('🔗', 'link', 'url'),
  E('🔒', 'lock', 'private secure'),
  E('🔑', 'key', 'password'),
  E('🛠️', 'hammer_and_wrench', 'tools fix build'),
  E('🐛', 'bug', 'insect error'),
  E('🧪', 'test_tube', 'test experiment'),
  E('📦', 'package', 'box ship release'),
  E('📝', 'memo', 'note write'),
  E('📅', 'calendar', 'date schedule'),
  E('⏰', 'alarm_clock', 'time late'),
  E('☕', 'coffee', 'break cafe'),
  E('🍺', 'beer', 'drink cheers'),
  E('🍕', 'pizza', 'food'),
  E('🎂', 'birthday', 'cake'),
  E('🌮', 'taco', 'food'),
  E('🐝', 'bee', 'buzz'),
  E('🦄', 'unicorn', 'magic'),
  E('🐙', 'octopus', ''),
  E('🌈', 'rainbow', 'pride'),
  E('☀️', 'sunny', 'sun weather'),
  E('🌙', 'crescent_moon', 'night'),
  E('⚡', 'zap', 'lightning fast'),
  E('❄️', 'snowflake', 'cold winter'),
  E('🌊', 'ocean', 'wave sea'),
  E('💯', '100', 'hundred perfect'),
  E('💥', 'boom', 'explosion'),
  E('💫', 'dizzy', 'star'),
  E('💬', 'speech_balloon', 'chat message'),
  E('💭', 'thought_balloon', 'thinking'),
  E('🏆', 'trophy', 'win prize'),
  E('🥇', 'first_place_medal', 'gold winner'),
  E('⚽', 'soccer', 'football sport'),
  E('🎯', 'dart', 'target bullseye'),
  E('🎲', 'game_die', 'dice random'),
  E('🎵', 'musical_note', 'music song'),
  E('🎸', 'guitar', 'music'),
  E('🖖', 'vulcan_salute', 'spock'),
  E('🤖', 'robot', 'bot ai'),
  E('👻', 'ghost', 'boo'),
  E('💀', 'skull', 'dead'),
  E('🎃', 'jack_o_lantern', 'halloween pumpkin'),
  E('🐶', 'dog', 'puppy'),
  E('🐱', 'cat', 'kitten'),
  E('🌱', 'seedling', 'plant grow'),
  E('🌲', 'evergreen_tree', 'tree nature'),
  E('🍀', 'four_leaf_clover', 'luck'),
]

/** Case-insensitive search across name and keywords. */
export function searchEmoji(query: string): EmojiEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return EMOJI
  return EMOJI.filter(
    entry => entry.name.includes(q) || entry.keywords.includes(q),
  )
}

const SHORTCODE = /:([a-z0-9_+-]+):/g
const BY_NAME = new Map(EMOJI.map(entry => [entry.name, entry.char]))
BY_NAME.set('+1', '👍')
BY_NAME.set('-1', '👎')

/** Replace every complete :shortcode: that names a known emoji. */
export function replaceShortcodes(text: string): string {
  return text.replace(SHORTCODE, (whole, name: string) =>
    BY_NAME.get(name) ?? whole,
  )
}
