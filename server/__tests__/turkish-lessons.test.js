import { describe, it, expect } from 'vitest';
import {
    LESSONS,
    getDailyLessonIndex,
    getDailyLesson,
    buildQuiz,
    shuffleArray
} from '../turkish-lessons.js';

describe('LESSONS', () => {
    it('has 30 lessons', () => {
        expect(LESSONS).toHaveLength(30);
    });

    it('each lesson has an id, topic, and 5 words', () => {
        for (const lesson of LESSONS) {
            expect(lesson).toHaveProperty('id');
            expect(lesson).toHaveProperty('topic');
            expect(lesson.words).toHaveLength(5);
        }
    });

    it('each word has tr, en, and de fields', () => {
        for (const lesson of LESSONS) {
            for (const word of lesson.words) {
                expect(word).toHaveProperty('tr');
                expect(word).toHaveProperty('en');
                expect(word).toHaveProperty('de');
                expect(word.tr.length).toBeGreaterThan(0);
                expect(word.en.length).toBeGreaterThan(0);
                expect(word.de.length).toBeGreaterThan(0);
            }
        }
    });

    it('has unique lesson ids', () => {
        const ids = LESSONS.map(l => l.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('getDailyLessonIndex', () => {
    it('returns a number between 0 and LESSONS.length - 1', () => {
        const index = getDailyLessonIndex();
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(LESSONS.length);
    });

    it('returns the same index for the same day', () => {
        const date = new Date('2025-06-15T10:00:00Z');
        const index1 = getDailyLessonIndex(date);
        const index2 = getDailyLessonIndex(date);
        expect(index1).toBe(index2);
    });

    it('returns a different index for different days', () => {
        const day1 = new Date('2025-06-15T00:00:00Z');
        const day2 = new Date('2025-06-16T00:00:00Z');
        const idx1 = getDailyLessonIndex(day1);
        const idx2 = getDailyLessonIndex(day2);
        // They should differ by 1 mod LESSONS.length
        expect((idx2 - idx1 + LESSONS.length) % LESSONS.length).toBe(1);
    });
});

describe('getDailyLesson', () => {
    it('returns a valid lesson object', () => {
        const lesson = getDailyLesson();
        expect(lesson).toHaveProperty('id');
        expect(lesson).toHaveProperty('topic');
        expect(lesson).toHaveProperty('words');
        expect(lesson.words).toHaveLength(5);
    });

    it('returns consistent lesson for same date', () => {
        const date = new Date('2025-01-01T00:00:00Z');
        const l1 = getDailyLesson(date);
        const l2 = getDailyLesson(date);
        expect(l1.id).toBe(l2.id);
        expect(l1.topic).toBe(l2.topic);
    });
});

describe('buildQuiz', () => {
    it('generates one question per word in the lesson', () => {
        const lesson = LESSONS[0];
        const quiz = buildQuiz(lesson);
        expect(quiz).toHaveLength(lesson.words.length);
    });

    it('each question has 4 options', () => {
        const lesson = LESSONS[0];
        const quiz = buildQuiz(lesson);
        for (const q of quiz) {
            expect(q.options).toHaveLength(4);
        }
    });

    it('each question includes the correct answer in options', () => {
        const lesson = LESSONS[0];
        const quiz = buildQuiz(lesson);
        for (const q of quiz) {
            expect(q.options).toContain(q.correct);
        }
    });

    it('question text is the Turkish word', () => {
        const lesson = LESSONS[0];
        const quiz = buildQuiz(lesson);
        const turkishWords = lesson.words.map(w => w.tr);
        for (const q of quiz) {
            expect(turkishWords).toContain(q.question);
        }
    });
});

describe('shuffleArray', () => {
    it('returns an array of the same length', () => {
        const arr = [1, 2, 3, 4, 5];
        const shuffled = shuffleArray(arr);
        expect(shuffled).toHaveLength(arr.length);
    });

    it('contains the same elements', () => {
        const arr = [1, 2, 3, 4, 5];
        const shuffled = shuffleArray(arr);
        expect(shuffled.sort()).toEqual(arr.sort());
    });

    it('does not modify the original array', () => {
        const arr = [1, 2, 3, 4, 5];
        const copy = [...arr];
        shuffleArray(arr);
        expect(arr).toEqual(copy);
    });
});
