// ============================
// REACTIONS MODULE - Friend Slop Details
// ============================

(function() {
    const { $ } = window.MaexchenApp;

    // Reaction texts for different events
    const REACTIONS = {
        roll: ['*würfelt nervös*', '*schüttelt den Becher*', '*hofft auf Glück*'],
        announce_low: ['Hmm...', 'Safe.', 'Easy.', 'Okay...'],
        announce_high: ['Oh oh...', 'Spicy!', 'Risky!', 'Mutig!'],
        announce_maexchen: ['MÄXCHEN?!', 'No way!', 'Echt jetzt?!', 'WHAT'],
        challenge: ['CAP!', 'Ich glaub dir nicht!', 'Sus!', 'Lügner?'],
        challenge_won: ['Erwischt!', 'Lügner!', 'Ha!', 'Wusst ichs!'],
        challenge_lost: ['Oof.', 'F', 'Autsch...', 'Nope.'],
        believe: ['Okay...', 'Ich trau mich nicht', 'Lieber nicht...'],
        player_eliminated: ['RIP', 'Tschüss!', 'Skill Issue', 'Weg bist du!'],
        win: ['GG EZ', 'Dominated', 'Victory!', 'Der Beste!'],
        join: ['Willkommen!', 'Neuer Spieler!', 'Hey!'],
        leave: ['Cya!', 'Tschau!', 'Bye bye!']
    };

    // Random transmissions that appear occasionally
    const TRANSMISSIONS = [
        '... incoming signal ...',
        '... frequency detected ...',
        '... alien activity ...',
        '... scanning sector ...',
        '... transmission received ...',
        '... unknown origin ...',
        '... signal lost ...',
        '... reconnecting ...'
    ];

    let transmissionInterval = null;

    // Get random item from array
    function randomFrom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // Show a floating reaction
    function showReaction(type, x, y) {
        const reactions = REACTIONS[type];
        if (!reactions || reactions.length === 0) return;

        const text = randomFrom(reactions);
        createFloatingText(text, x, y);
    }

    // Show reaction at dice container position
    function showReactionAtDice(type) {
        const container = $('dice-container');
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const x = rect.left + rect.width / 2 + (Math.random() - 0.5) * 100;
        const y = rect.top + rect.height / 3;

        showReaction(type, x, y);
    }

    // Show reaction at center of screen
    function showReactionCentered(type) {
        const x = window.innerWidth / 2 + (Math.random() - 0.5) * 100;
        const y = window.innerHeight / 2 - 50;
        showReaction(type, x, y);
    }

    // Create floating text element
    function createFloatingText(text, x, y) {
        const el = document.createElement('div');
        el.className = 'floating-reaction';
        el.textContent = text;
        el.style.left = x + 'px';
        el.style.top = y + 'px';

        // Random color variation
        const colors = ['#00ff88', '#00ffaa', '#ffdd00', '#ff3366'];
        el.style.color = randomFrom(colors);

        document.body.appendChild(el);

        // Remove after animation
        setTimeout(() => {
            if (el.parentNode) {
                el.parentNode.removeChild(el);
            }
        }, 2000);
    }

    // Initialize Easter Eggs
    function initEasterEggs() {
        // Title glitch effect on click
        document.querySelectorAll('.title-maexchen').forEach(title => {
            title.addEventListener('click', () => {
                title.classList.add('glitch');
                setTimeout(() => title.classList.remove('glitch'), 300);
            });
        });

        // Dice container click - random bounce on any die inside
        const diceContainer = $('dice-container');
        if (diceContainer) {
            diceContainer.addEventListener('click', (e) => {
                const die = e.target.closest('.die');
                if (die) {
                    die.style.transition = 'transform 0.15s ease';
                    die.style.transform = 'scale(1.1) rotate(5deg)';
                    setTimeout(() => {
                        die.style.transform = 'scale(1) rotate(0deg)';
                    }, 150);
                }
            });
        }
    }

    // Start random transmission messages in chat
    function startTransmissions() {
        if (transmissionInterval) return;

        transmissionInterval = setInterval(() => {
            // 10% chance every 30 seconds
            if (Math.random() < 0.1 && window.MaexchenChat) {
                window.MaexchenChat.addLocalMessage(randomFrom(TRANSMISSIONS));
            }
        }, 30000);
    }

    // Stop transmission messages
    function stopTransmissions() {
        if (transmissionInterval) {
            clearInterval(transmissionInterval);
            transmissionInterval = null;
        }
    }

    // Screen shake effect
    function shakeScreen() {
        const app = $('app');
        if (app) {
            app.classList.add('shaking');
            setTimeout(() => app.classList.remove('shaking'), 500);
        }
    }

    // Initialize on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initEasterEggs);
    } else {
        initEasterEggs();
    }

    // Public API
    window.MaexchenReactions = {
        showReaction,
        showReactionAtDice,
        showReactionCentered,
        createFloatingText,
        startTransmissions,
        stopTransmissions,
        shakeScreen,
        REACTIONS
    };
})();
