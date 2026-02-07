// Turkish daily lesson data and logic
// Each lesson has vocabulary + a mini quiz for ~60 second sessions

const LESSONS = [
    {
        id: 1,
        topic: 'Greetings',
        words: [
            { tr: 'Merhaba', en: 'Hello', de: 'Hallo' },
            { tr: 'Günaydın', en: 'Good morning', de: 'Guten Morgen' },
            { tr: 'İyi akşamlar', en: 'Good evening', de: 'Guten Abend' },
            { tr: 'Hoşça kal', en: 'Goodbye', de: 'Auf Wiedersehen' },
            { tr: 'Nasılsın?', en: 'How are you?', de: 'Wie geht es dir?' },
        ],
    },
    {
        id: 2,
        topic: 'Numbers 1-5',
        words: [
            { tr: 'Bir', en: 'One', de: 'Eins' },
            { tr: 'İki', en: 'Two', de: 'Zwei' },
            { tr: 'Üç', en: 'Three', de: 'Drei' },
            { tr: 'Dört', en: 'Four', de: 'Vier' },
            { tr: 'Beş', en: 'Five', de: 'Fünf' },
        ],
    },
    {
        id: 3,
        topic: 'Numbers 6-10',
        words: [
            { tr: 'Altı', en: 'Six', de: 'Sechs' },
            { tr: 'Yedi', en: 'Seven', de: 'Sieben' },
            { tr: 'Sekiz', en: 'Eight', de: 'Acht' },
            { tr: 'Dokuz', en: 'Nine', de: 'Neun' },
            { tr: 'On', en: 'Ten', de: 'Zehn' },
        ],
    },
    {
        id: 4,
        topic: 'Colors',
        words: [
            { tr: 'Kırmızı', en: 'Red', de: 'Rot' },
            { tr: 'Mavi', en: 'Blue', de: 'Blau' },
            { tr: 'Yeşil', en: 'Green', de: 'Grün' },
            { tr: 'Sarı', en: 'Yellow', de: 'Gelb' },
            { tr: 'Siyah', en: 'Black', de: 'Schwarz' },
        ],
    },
    {
        id: 5,
        topic: 'Food',
        words: [
            { tr: 'Ekmek', en: 'Bread', de: 'Brot' },
            { tr: 'Su', en: 'Water', de: 'Wasser' },
            { tr: 'Çay', en: 'Tea', de: 'Tee' },
            { tr: 'Peynir', en: 'Cheese', de: 'Käse' },
            { tr: 'Elma', en: 'Apple', de: 'Apfel' },
        ],
    },
    {
        id: 6,
        topic: 'Family',
        words: [
            { tr: 'Anne', en: 'Mother', de: 'Mutter' },
            { tr: 'Baba', en: 'Father', de: 'Vater' },
            { tr: 'Kardeş', en: 'Sibling', de: 'Geschwister' },
            { tr: 'Aile', en: 'Family', de: 'Familie' },
            { tr: 'Çocuk', en: 'Child', de: 'Kind' },
        ],
    },
    {
        id: 7,
        topic: 'Common Phrases',
        words: [
            { tr: 'Teşekkür ederim', en: 'Thank you', de: 'Danke' },
            { tr: 'Lütfen', en: 'Please', de: 'Bitte' },
            { tr: 'Evet', en: 'Yes', de: 'Ja' },
            { tr: 'Hayır', en: 'No', de: 'Nein' },
            { tr: 'Affedersiniz', en: 'Excuse me', de: 'Entschuldigung' },
        ],
    },
    {
        id: 8,
        topic: 'Animals',
        words: [
            { tr: 'Kedi', en: 'Cat', de: 'Katze' },
            { tr: 'Köpek', en: 'Dog', de: 'Hund' },
            { tr: 'Kuş', en: 'Bird', de: 'Vogel' },
            { tr: 'Balık', en: 'Fish', de: 'Fisch' },
            { tr: 'At', en: 'Horse', de: 'Pferd' },
        ],
    },
    {
        id: 9,
        topic: 'Days of the Week',
        words: [
            { tr: 'Pazartesi', en: 'Monday', de: 'Montag' },
            { tr: 'Salı', en: 'Tuesday', de: 'Dienstag' },
            { tr: 'Çarşamba', en: 'Wednesday', de: 'Mittwoch' },
            { tr: 'Perşembe', en: 'Thursday', de: 'Donnerstag' },
            { tr: 'Cuma', en: 'Friday', de: 'Freitag' },
        ],
    },
    {
        id: 10,
        topic: 'At the Market',
        words: [
            { tr: 'Ne kadar?', en: 'How much?', de: 'Wie viel?' },
            { tr: 'Pahalı', en: 'Expensive', de: 'Teuer' },
            { tr: 'Ucuz', en: 'Cheap', de: 'Günstig' },
            { tr: 'Hesap', en: 'Bill', de: 'Rechnung' },
            { tr: 'Para', en: 'Money', de: 'Geld' },
        ],
    },
    {
        id: 11,
        topic: 'Weather',
        words: [
            { tr: 'Güneş', en: 'Sun', de: 'Sonne' },
            { tr: 'Yağmur', en: 'Rain', de: 'Regen' },
            { tr: 'Kar', en: 'Snow', de: 'Schnee' },
            { tr: 'Sıcak', en: 'Hot', de: 'Heiß' },
            { tr: 'Soğuk', en: 'Cold', de: 'Kalt' },
        ],
    },
    {
        id: 12,
        topic: 'Body Parts',
        words: [
            { tr: 'Baş', en: 'Head', de: 'Kopf' },
            { tr: 'Göz', en: 'Eye', de: 'Auge' },
            { tr: 'El', en: 'Hand', de: 'Hand' },
            { tr: 'Ayak', en: 'Foot', de: 'Fuß' },
            { tr: 'Kalp', en: 'Heart', de: 'Herz' },
        ],
    },
    {
        id: 13,
        topic: 'Verbs',
        words: [
            { tr: 'Gitmek', en: 'To go', de: 'Gehen' },
            { tr: 'Gelmek', en: 'To come', de: 'Kommen' },
            { tr: 'Yemek', en: 'To eat', de: 'Essen' },
            { tr: 'İçmek', en: 'To drink', de: 'Trinken' },
            { tr: 'Konuşmak', en: 'To speak', de: 'Sprechen' },
        ],
    },
    {
        id: 14,
        topic: 'Places',
        words: [
            { tr: 'Ev', en: 'House', de: 'Haus' },
            { tr: 'Okul', en: 'School', de: 'Schule' },
            { tr: 'Hastane', en: 'Hospital', de: 'Krankenhaus' },
            { tr: 'Restoran', en: 'Restaurant', de: 'Restaurant' },
            { tr: 'Otel', en: 'Hotel', de: 'Hotel' },
        ],
    },
    {
        id: 15,
        topic: 'Time',
        words: [
            { tr: 'Saat', en: 'Hour / Clock', de: 'Stunde / Uhr' },
            { tr: 'Dakika', en: 'Minute', de: 'Minute' },
            { tr: 'Bugün', en: 'Today', de: 'Heute' },
            { tr: 'Yarın', en: 'Tomorrow', de: 'Morgen' },
            { tr: 'Dün', en: 'Yesterday', de: 'Gestern' },
        ],
    },
    {
        id: 16,
        topic: 'Adjectives',
        words: [
            { tr: 'Büyük', en: 'Big', de: 'Groß' },
            { tr: 'Küçük', en: 'Small', de: 'Klein' },
            { tr: 'Güzel', en: 'Beautiful', de: 'Schön' },
            { tr: 'İyi', en: 'Good', de: 'Gut' },
            { tr: 'Kötü', en: 'Bad', de: 'Schlecht' },
        ],
    },
    {
        id: 17,
        topic: 'Travel',
        words: [
            { tr: 'Uçak', en: 'Airplane', de: 'Flugzeug' },
            { tr: 'Tren', en: 'Train', de: 'Zug' },
            { tr: 'Otobüs', en: 'Bus', de: 'Bus' },
            { tr: 'Bilet', en: 'Ticket', de: 'Ticket' },
            { tr: 'Bavul', en: 'Suitcase', de: 'Koffer' },
        ],
    },
    {
        id: 18,
        topic: 'Feelings',
        words: [
            { tr: 'Mutlu', en: 'Happy', de: 'Glücklich' },
            { tr: 'Üzgün', en: 'Sad', de: 'Traurig' },
            { tr: 'Kızgın', en: 'Angry', de: 'Wütend' },
            { tr: 'Yorgun', en: 'Tired', de: 'Müde' },
            { tr: 'Heyecanlı', en: 'Excited', de: 'Aufgeregt' },
        ],
    },
    {
        id: 19,
        topic: 'Clothes',
        words: [
            { tr: 'Gömlek', en: 'Shirt', de: 'Hemd' },
            { tr: 'Pantolon', en: 'Pants', de: 'Hose' },
            { tr: 'Ayakkabı', en: 'Shoes', de: 'Schuhe' },
            { tr: 'Şapka', en: 'Hat', de: 'Hut' },
            { tr: 'Ceket', en: 'Jacket', de: 'Jacke' },
        ],
    },
    {
        id: 20,
        topic: 'Weekend & Hobbies',
        words: [
            { tr: 'Hafta sonu', en: 'Weekend', de: 'Wochenende' },
            { tr: 'Müzik', en: 'Music', de: 'Musik' },
            { tr: 'Kitap', en: 'Book', de: 'Buch' },
            { tr: 'Spor', en: 'Sports', de: 'Sport' },
            { tr: 'Film', en: 'Movie', de: 'Film' },
        ],
    },
    {
        id: 21,
        topic: 'Around the House',
        words: [
            { tr: 'Kapı', en: 'Door', de: 'Tür' },
            { tr: 'Pencere', en: 'Window', de: 'Fenster' },
            { tr: 'Masa', en: 'Table', de: 'Tisch' },
            { tr: 'Sandalye', en: 'Chair', de: 'Stuhl' },
            { tr: 'Yatak', en: 'Bed', de: 'Bett' },
        ],
    },
    {
        id: 22,
        topic: 'Directions',
        words: [
            { tr: 'Sağ', en: 'Right', de: 'Rechts' },
            { tr: 'Sol', en: 'Left', de: 'Links' },
            { tr: 'Düz', en: 'Straight', de: 'Geradeaus' },
            { tr: 'Yakın', en: 'Near', de: 'Nah' },
            { tr: 'Uzak', en: 'Far', de: 'Weit' },
        ],
    },
    {
        id: 23,
        topic: 'Drinks',
        words: [
            { tr: 'Kahve', en: 'Coffee', de: 'Kaffee' },
            { tr: 'Süt', en: 'Milk', de: 'Milch' },
            { tr: 'Meyve suyu', en: 'Juice', de: 'Saft' },
            { tr: 'Bira', en: 'Beer', de: 'Bier' },
            { tr: 'Şarap', en: 'Wine', de: 'Wein' },
        ],
    },
    {
        id: 24,
        topic: 'At the Restaurant',
        words: [
            { tr: 'Menü', en: 'Menu', de: 'Speisekarte' },
            { tr: 'Garson', en: 'Waiter', de: 'Kellner' },
            { tr: 'Afiyet olsun', en: 'Bon appétit', de: 'Guten Appetit' },
            { tr: 'Bahşiş', en: 'Tip', de: 'Trinkgeld' },
            { tr: 'Rezervasyon', en: 'Reservation', de: 'Reservierung' },
        ],
    },
    {
        id: 25,
        topic: 'Nature',
        words: [
            { tr: 'Deniz', en: 'Sea', de: 'Meer' },
            { tr: 'Dağ', en: 'Mountain', de: 'Berg' },
            { tr: 'Orman', en: 'Forest', de: 'Wald' },
            { tr: 'Nehir', en: 'River', de: 'Fluss' },
            { tr: 'Çiçek', en: 'Flower', de: 'Blume' },
        ],
    },
    {
        id: 26,
        topic: 'Professions',
        words: [
            { tr: 'Doktor', en: 'Doctor', de: 'Arzt' },
            { tr: 'Öğretmen', en: 'Teacher', de: 'Lehrer' },
            { tr: 'Mühendis', en: 'Engineer', de: 'Ingenieur' },
            { tr: 'Avukat', en: 'Lawyer', de: 'Anwalt' },
            { tr: 'Aşçı', en: 'Cook', de: 'Koch' },
        ],
    },
    {
        id: 27,
        topic: 'Turkish Culture',
        words: [
            { tr: 'Çarşı', en: 'Bazaar', de: 'Basar' },
            { tr: 'Cami', en: 'Mosque', de: 'Moschee' },
            { tr: 'Hamam', en: 'Turkish bath', de: 'Türkisches Bad' },
            { tr: 'Bayram', en: 'Holiday/Festival', de: 'Feiertag/Fest' },
            { tr: 'Misafir', en: 'Guest', de: 'Gast' },
        ],
    },
    {
        id: 28,
        topic: 'Everyday Verbs',
        words: [
            { tr: 'Okumak', en: 'To read', de: 'Lesen' },
            { tr: 'Yazmak', en: 'To write', de: 'Schreiben' },
            { tr: 'Çalışmak', en: 'To work', de: 'Arbeiten' },
            { tr: 'Uyumak', en: 'To sleep', de: 'Schlafen' },
            { tr: 'Almak', en: 'To take/buy', de: 'Nehmen/Kaufen' },
        ],
    },
    {
        id: 29,
        topic: 'Questions',
        words: [
            { tr: 'Ne?', en: 'What?', de: 'Was?' },
            { tr: 'Nerede?', en: 'Where?', de: 'Wo?' },
            { tr: 'Ne zaman?', en: 'When?', de: 'Wann?' },
            { tr: 'Neden?', en: 'Why?', de: 'Warum?' },
            { tr: 'Kim?', en: 'Who?', de: 'Wer?' },
        ],
    },
    {
        id: 30,
        topic: 'Seasons & Months',
        words: [
            { tr: 'İlkbahar', en: 'Spring', de: 'Frühling' },
            { tr: 'Yaz', en: 'Summer', de: 'Sommer' },
            { tr: 'Sonbahar', en: 'Autumn', de: 'Herbst' },
            { tr: 'Kış', en: 'Winter', de: 'Winter' },
            { tr: 'Ocak', en: 'January', de: 'Januar' },
        ],
    },
];

/**
 * Get the daily lesson index based on the current UTC date.
 * Cycles through all lessons, one per day.
 * @param {Date} [date] - optional date override for testing
 * @returns {number} lesson index (0-based)
 */
export function getDailyLessonIndex(date) {
    const d = date || new Date();
    // Days since Unix epoch (UTC)
    const daysSinceEpoch = Math.floor(d.getTime() / (1000 * 60 * 60 * 24));
    return daysSinceEpoch % LESSONS.length;
}

/**
 * Get today's lesson.
 * @param {Date} [date] - optional date override for testing
 * @returns {object} lesson object with id, topic, words
 */
export function getDailyLesson(date) {
    const index = getDailyLessonIndex(date);
    return LESSONS[index];
}

/**
 * Build quiz questions from a lesson's words.
 * Each question asks "What does [Turkish word] mean?" with 4 choices.
 * @param {object} lesson - a lesson object
 * @returns {Array} array of quiz question objects
 */
export function buildQuiz(lesson) {
    // Collect all English meanings from all lessons for wrong answers
    const allMeanings = LESSONS.flatMap(l => l.words.map(w => w.en));

    return lesson.words.map(word => {
        // Get wrong answers (excluding the correct one)
        const wrongPool = allMeanings.filter(m => m !== word.en);
        const shuffled = shuffleArray([...wrongPool]);
        const wrongAnswers = shuffled.slice(0, 3);

        // Combine and shuffle options
        const options = shuffleArray([word.en, ...wrongAnswers]);

        return {
            question: word.tr,
            correct: word.en,
            options,
        };
    });
}

/**
 * Shuffle an array (Fisher-Yates).
 * @param {Array} arr
 * @returns {Array} shuffled copy
 */
export function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export { LESSONS };
