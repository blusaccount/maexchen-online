(function () {
    'use strict';

    const $ = id => document.getElementById(id);
    const QUIZ_TIME = 60; // seconds
    const LESSON_LOAD_ERROR_MESSAGE = 'Die Tageslektion konnte nicht geladen werden. Bitte versuche es erneut.';

    let lesson = null;
    let quiz = [];
    let currentQ = 0;
    let score = 0;
    let timer = null;
    let timeLeft = QUIZ_TIME;

    // ===== Screen Management =====
    function showScreen(name) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const el = $('screen-' + name);
        if (el) el.classList.add('active');
    }

    // ===== Fetch Daily Lesson =====
    async function loadLesson() {
        setLoadError('');
        setStartButtonEnabled(false);

        try {
            const res = await fetch('/api/turkish/daily');
            if (!res.ok) {
                const payload = await res.json().catch(function () { return null; });
                const message = payload && payload.message ? payload.message : LESSON_LOAD_ERROR_MESSAGE;
                throw new Error(message);
            }

            lesson = await res.json();
            renderLesson();
            setStartButtonEnabled(true);
        } catch (err) {
            lesson = null;
            $('lesson-topic').textContent = 'Lektion nicht verfügbar';
            $('lesson-day').textContent = 'Bitte versuche es erneut.';
            $('word-list').innerHTML = '';
            setLoadError(err && err.message ? err.message : LESSON_LOAD_ERROR_MESSAGE);
            setStartButtonEnabled(false);
            console.error('Failed to load lesson:', err);
        }
    }


    function setLoadError(message) {
        const box = $('lesson-error');
        const text = $('lesson-error-message');
        const hasMessage = !!message;

        if (text) text.textContent = message || '';
        if (box) box.classList.toggle('active', hasMessage);
    }

    function setStartButtonEnabled(enabled) {
        const btn = $('btn-start-quiz');
        if (!btn) return;
        btn.disabled = !enabled;
    }

    function renderLesson() {
        $('lesson-topic').textContent = '📖 ' + lesson.topic;
        $('lesson-day').textContent = 'Daily Lesson #' + lesson.id;

        const list = $('word-list');
        list.innerHTML = '';
        lesson.words.forEach(w => {
            const card = document.createElement('div');
            card.className = 'word-card';
            card.innerHTML =
                '<span class="word-turkish">' + escapeHtml(w.tr) + '</span>' +
                '<span class="word-meaning">' + escapeHtml(w.en) + '</span>';
            list.appendChild(card);
        });
    }

    // ===== Quiz =====
    function startQuiz() {
        if (!lesson) return;

        quiz = lesson.quiz;
        currentQ = 0;
        score = 0;
        timeLeft = QUIZ_TIME;
        showScreen('quiz');
        renderQuestion();
        startTimer();
    }

    function renderQuestion() {
        if (currentQ >= quiz.length) {
            endQuiz();
            return;
        }

        const q = quiz[currentQ];
        $('quiz-progress').textContent = 'Question ' + (currentQ + 1) + ' / ' + quiz.length;
        $('quiz-question').textContent = q.question;
        $('quiz-feedback').textContent = '';

        const opts = $('quiz-options');
        opts.innerHTML = '';
        q.options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'quiz-option';
            btn.textContent = opt;
            btn.addEventListener('click', function () { handleAnswer(opt, q.correct); });
            opts.appendChild(btn);
        });
    }

    function handleAnswer(selected, correct) {
        const opts = $('quiz-options').querySelectorAll('.quiz-option');
        opts.forEach(btn => {
            btn.classList.add('disabled');
            if (btn.textContent === correct) btn.classList.add('correct');
            if (btn.textContent === selected && selected !== correct) btn.classList.add('wrong');
        });

        if (selected === correct) {
            score++;
            $('quiz-feedback').textContent = '✓ Correct!';
            $('quiz-feedback').style.color = '#228833';
        } else {
            $('quiz-feedback').textContent = '✗ ' + correct;
            $('quiz-feedback').style.color = '#cc3333';
        }

        setTimeout(function () {
            currentQ++;
            renderQuestion();
        }, 1200);
    }

    // ===== Timer =====
    function startTimer() {
        updateTimerDisplay();
        timer = setInterval(function () {
            timeLeft--;
            updateTimerDisplay();
            if (timeLeft <= 0) {
                endQuiz();
            }
        }, 1000);
    }

    function updateTimerDisplay() {
        const pct = (timeLeft / QUIZ_TIME) * 100;
        $('timer-bar').style.width = pct + '%';
        $('timer-text').textContent = timeLeft + 's';
    }

    function stopTimer() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }

    // ===== Results =====
    function endQuiz() {
        stopTimer();
        showScreen('result');

        const total = quiz.length;
        const pct = total > 0 ? Math.round((score / total) * 100) : 0;

        let emoji, title;
        if (pct === 100) { emoji = '🏆'; title = 'PERFECT!'; }
        else if (pct >= 80) { emoji = '⭐'; title = 'GREAT JOB!'; }
        else if (pct >= 60) { emoji = '👍'; title = 'GOOD WORK!'; }
        else if (pct >= 40) { emoji = '📚'; title = 'KEEP LEARNING!'; }
        else { emoji = '💪'; title = 'TRY AGAIN!'; }

        $('result-emoji').textContent = emoji;
        $('result-title').textContent = title;
        $('result-score').textContent = score + ' / ' + total;
        $('result-detail').textContent = pct + '% correct · Topic: ' + lesson.topic;
    }

    // ===== Helpers =====
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // ===== Event Listeners =====
    $('btn-start-quiz').addEventListener('click', startQuiz);
    $('btn-retry-lesson').addEventListener('click', loadLesson);
    $('btn-replay').addEventListener('click', function () {
        showScreen('learn');
    });

    // ===== Init =====
    loadLesson();
})();
