const slogans = [
	'What are we pirating today?',
	'Ahoy! What treasure seeketh ye?',
	"Type something, I won't tell anyone...",
	"Your ISP can't see this, probably",
	'Shiver me timbers, search away!',
	'Totally legal music search...',
	"What's on your wishlist?",
	'The high seas await...',
	'Insert banger here',
	'No judgment zone',
	'Spotify who?',
	'Supporting artists spiritually',
	'For educational purposes only',
	'Nice music taste btw'
];

export function load() {
	return {
		slogan: slogans[Math.floor(Math.random() * slogans.length)]
	};
}
