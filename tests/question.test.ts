import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient, Book } from "@prisma/client"; // Book 타입을 가져옵니다.

const prisma = new PrismaClient();

describe("Question Model", () => {
  let testBook: Book;

  beforeEach(async () => {
    // 의존하는 데이터부터 삭제
    await prisma.answer.deleteMany({}); // Question을 참조
    await prisma.question.deleteMany({});
    // Book을 참조하는 BookshelfEntry도 삭제 (테스트 격리를 위해)
    await prisma.bookshelfEntry.deleteMany({});
    await prisma.book.deleteMany({});

    // 테스트를 위한 Book 생성
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    testBook = await prisma.book.create({
      data: {
        isbn: `isbn_q_${timestamp}_${randomSuffix}`,
        title: "Test Book for Questions",
        author: "Test Author",
        publisher: "Test Publisher",
      },
    });
  });

  afterEach(async () => {
    await prisma.answer.deleteMany({});
    await prisma.question.deleteMany({});
    await prisma.bookshelfEntry.deleteMany({});
    await prisma.book.deleteMany({});
  });

  it("should create a new question for a book", async () => {
    const questionContent = "이 책에서 가장 인상 깊었던 문장은 무엇인가요?";
    const newQuestion = await prisma.question.create({
      data: {
        bookIsbn: testBook.isbn,
        content: questionContent,
        // createdAt, updatedAt은 자동으로 생성됨
      },
    });

    expect(newQuestion.id).toBeDefined();
    expect(newQuestion.bookIsbn).toBe(testBook.isbn);
    expect(newQuestion.content).toBe(questionContent);
    expect(newQuestion.createdAt).toBeInstanceOf(Date);
    expect(newQuestion.updatedAt).toBeInstanceOf(Date);

    // (선택적) 관계를 통해 데이터가 올바르게 연결되었는지 확인
    const questionWithBook = await prisma.question.findUnique({
      where: { id: newQuestion.id },
      include: { book: true },
    });
    expect(questionWithBook?.book.title).toBe(testBook.title);
  });

  it("should allow creating multiple questions for the same book", async () => {
    // 스키마에 bookIsbn에 대한 unique 제약이 없으므로 여러 질문 생성 가능
    const questionContent1 = "질문 1";
    const questionContent2 = "질문 2";

    await prisma.question.create({
      data: { bookIsbn: testBook.isbn, content: questionContent1 },
    });
    await prisma.question.create({
      data: { bookIsbn: testBook.isbn, content: questionContent2 },
    });

    const questionsForBook = await prisma.question.findMany({
      where: { bookIsbn: testBook.isbn },
    });
    expect(questionsForBook.length).toBe(2);
  });

  it("should find questions by book ISBN", async () => {
    const questionContent = "이 책의 주제는 무엇이라고 생각하시나요?";
    await prisma.question.create({
      data: { bookIsbn: testBook.isbn, content: questionContent },
    });

    const anotherTimestamp = Date.now();
    const anotherRandomSuffix = Math.random().toString(36).substring(2, 7);
    const anotherBook = await prisma.book.create({
      data: {
        isbn: `isbn_q_other_${anotherTimestamp}_${anotherRandomSuffix}`,
        title: "Another Book",
        author: "Other Author",
        publisher: "Other Publisher",
      },
    });
    await prisma.question.create({
      data: { bookIsbn: anotherBook.isbn, content: "다른 책 질문" },
    });

    const foundQuestions = await prisma.question.findMany({
      where: { bookIsbn: testBook.isbn },
    });

    expect(foundQuestions.length).toBe(1);
    expect(foundQuestions[0].content).toBe(questionContent);
  });

  it("should update a question's content", async () => {
    const initialQuestion = await prisma.question.create({
      data: {
        bookIsbn: testBook.isbn,
        content: "초기 질문 내용입니다.",
      },
    });

    const updatedContent = "수정된 질문 내용입니다.";
    const updatedQuestion = await prisma.question.update({
      where: { id: initialQuestion.id },
      data: { content: updatedContent },
    });

    expect(updatedQuestion.content).toBe(updatedContent);
    expect(updatedQuestion.bookIsbn).toBe(initialQuestion.bookIsbn); // bookIsbn은 변경되지 않음
    expect(updatedQuestion.updatedAt.getTime()).toBeGreaterThan(
      initialQuestion.updatedAt.getTime()
    );
  });

  it("should delete a question", async () => {
    const question = await prisma.question.create({
      data: {
        bookIsbn: testBook.isbn,
        content: "삭제될 질문입니다.",
      },
    });

    await prisma.question.delete({
      where: { id: question.id },
    });

    const deletedQuestion = await prisma.question.findUnique({
      where: { id: question.id },
    });
    expect(deletedQuestion).toBeNull();
  });

  it("should cascade delete questions when a book is deleted", async () => {
    await prisma.question.create({
      data: { bookIsbn: testBook.isbn, content: "책과 함께 삭제될 질문 1" },
    });
    await prisma.question.create({
      data: { bookIsbn: testBook.isbn, content: "책과 함께 삭제될 질문 2" },
    });

    // Book 삭제
    await prisma.book.delete({ where: { isbn: testBook.isbn } });

    const questions = await prisma.question.findMany({
      where: { bookIsbn: testBook.isbn },
    });
    expect(questions.length).toBe(0);
  });
});
