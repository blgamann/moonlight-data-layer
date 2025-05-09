import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient, User, Book, Question } from "@prisma/client";

const prisma = new PrismaClient();

describe("Answer Model", () => {
  let testUser: User;
  let testBook: Book;
  let testQuestion: Question;

  beforeEach(async () => {
    // 의존성 순서대로 삭제
    await prisma.answerInterest.deleteMany({}); // Answer를 참조
    await prisma.answer.deleteMany({});
    await prisma.question.deleteMany({});
    await prisma.bookshelfEntry.deleteMany({}); // Book, User 참조
    await prisma.user.deleteMany({});
    await prisma.book.deleteMany({});

    // 테스트용 User 생성
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    testUser = await prisma.user.create({
      data: {
        email: `user_ans_${timestamp}_${randomSuffix}@example.com`,
        passwordHash: "hashedpassword",
        name: "Test User for Answers",
      },
    });

    // 테스트용 Book 생성
    testBook = await prisma.book.create({
      data: {
        isbn: `isbn_ans_${timestamp}_${randomSuffix}`,
        title: "Test Book for Answers",
        author: "Test Author",
        publisher: "Test Publisher",
      },
    });

    // 테스트용 Question 생성
    testQuestion = await prisma.question.create({
      data: {
        bookIsbn: testBook.isbn,
        content: "이 책에 대한 당신의 생각은 무엇인가요?",
      },
    });
  });

  afterEach(async () => {
    await prisma.answerInterest.deleteMany({});
    await prisma.answer.deleteMany({});
    await prisma.question.deleteMany({});
    await prisma.bookshelfEntry.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.book.deleteMany({});
  });

  it("should create a new answer for a question by a user", async () => {
    const answerContent = "저는 이 책이 매우 감명 깊었다고 생각합니다.";
    const newAnswer = await prisma.answer.create({
      data: {
        userId: testUser.id,
        questionId: testQuestion.id,
        content: answerContent,
        // createdAt, updatedAt은 자동으로 생성됨
      },
    });

    expect(newAnswer.id).toBeDefined();
    expect(newAnswer.userId).toBe(testUser.id);
    expect(newAnswer.questionId).toBe(testQuestion.id);
    expect(newAnswer.content).toBe(answerContent);
    expect(newAnswer.createdAt).toBeInstanceOf(Date);
    expect(newAnswer.updatedAt).toBeInstanceOf(Date);

    // (선택적) 관계를 통해 데이터가 올바르게 연결되었는지 확인
    const answerWithRelations = await prisma.answer.findUnique({
      where: { id: newAnswer.id },
      include: { user: true, question: true },
    });
    expect(answerWithRelations?.user.email).toBe(testUser.email);
    expect(answerWithRelations?.question.content).toBe(testQuestion.content);
  });

  it("should allow multiple answers for the same question by different users", async () => {
    const anotherUser = await prisma.user.create({
      data: {
        email: `user_ans2_${Date.now()}@example.com`,
        passwordHash: "hashedpassword2",
      },
    });

    const answerContent1 = "첫 번째 사용자 답변입니다.";
    const answerContent2 = "두 번째 사용자 답변입니다.";

    await prisma.answer.create({
      data: {
        userId: testUser.id,
        questionId: testQuestion.id,
        content: answerContent1,
      },
    });
    await prisma.answer.create({
      data: {
        userId: anotherUser.id,
        questionId: testQuestion.id,
        content: answerContent2,
      },
    });

    const answersForQuestion = await prisma.answer.findMany({
      where: { questionId: testQuestion.id },
      orderBy: { createdAt: "asc" }, // 순서 보장을 위해
    });
    expect(answersForQuestion.length).toBe(2);
    expect(answersForQuestion[0].userId).toBe(testUser.id);
    expect(answersForQuestion[1].userId).toBe(anotherUser.id);
  });

  it("should allow multiple answers for different questions by the same user", async () => {
    const anotherQuestion = await prisma.question.create({
      data: {
        bookIsbn: testBook.isbn, // 동일한 책, 다른 질문
        content: "이 책의 다른 측면에 대한 질문입니다.",
      },
    });

    const answerContent1 = "첫 번째 질문에 대한 답변입니다.";
    const answerContent2 = "두 번째 질문에 대한 답변입니다.";

    await prisma.answer.create({
      data: {
        userId: testUser.id,
        questionId: testQuestion.id,
        content: answerContent1,
      },
    });
    await prisma.answer.create({
      data: {
        userId: testUser.id,
        questionId: anotherQuestion.id,
        content: answerContent2,
      },
    });

    const userAnswers = await prisma.answer.findMany({
      where: { userId: testUser.id },
      orderBy: { createdAt: "asc" },
    });
    expect(userAnswers.length).toBe(2);
    expect(userAnswers[0].questionId).toBe(testQuestion.id);
    expect(userAnswers[1].questionId).toBe(anotherQuestion.id);
  });

  it("should find answers by questionId", async () => {
    const answerContent = "이 질문에 대한 특정 답변입니다.";
    await prisma.answer.create({
      data: {
        userId: testUser.id,
        questionId: testQuestion.id,
        content: answerContent,
      },
    });

    // 다른 질문 생성 및 답변 (테스트 격리 확인용)
    const otherQ = await prisma.question.create({
      data: { bookIsbn: testBook.isbn, content: "다른 질문" },
    });
    await prisma.answer.create({
      data: {
        userId: testUser.id,
        questionId: otherQ.id,
        content: "다른 답변",
      },
    });

    const foundAnswers = await prisma.answer.findMany({
      where: { questionId: testQuestion.id },
    });

    expect(foundAnswers.length).toBe(1);
    expect(foundAnswers[0].content).toBe(answerContent);
  });

  it("should find answers by userId", async () => {
    const answerContent = "이 사용자의 특정 답변입니다.";
    await prisma.answer.create({
      data: {
        userId: testUser.id,
        questionId: testQuestion.id,
        content: answerContent,
      },
    });

    // 다른 사용자 생성 및 답변 (테스트 격리 확인용)
    const otherUser = await prisma.user.create({
      data: {
        email: `other_user_ans_${Date.now()}@example.com`,
        passwordHash: "pw",
      },
    });
    await prisma.answer.create({
      data: {
        userId: otherUser.id,
        questionId: testQuestion.id,
        content: "다른 사용자의 답변",
      },
    });

    const foundAnswers = await prisma.answer.findMany({
      where: { userId: testUser.id },
    });

    expect(foundAnswers.length).toBe(1);
    expect(foundAnswers[0].content).toBe(answerContent);
  });

  it("should update an answer's content", async () => {
    const initialAnswer = await prisma.answer.create({
      data: {
        userId: testUser.id,
        questionId: testQuestion.id,
        content: "초기 답변 내용입니다.",
      },
    });

    const updatedContent = "수정된 답변 내용입니다.";
    const updatedAnswer = await prisma.answer.update({
      where: { id: initialAnswer.id },
      data: { content: updatedContent },
    });

    expect(updatedAnswer.content).toBe(updatedContent);
    expect(updatedAnswer.userId).toBe(initialAnswer.userId);
    expect(updatedAnswer.questionId).toBe(initialAnswer.questionId);
    expect(updatedAnswer.updatedAt.getTime()).toBeGreaterThan(
      initialAnswer.updatedAt.getTime()
    );
  });

  it("should delete an answer", async () => {
    const answer = await prisma.answer.create({
      data: {
        userId: testUser.id,
        questionId: testQuestion.id,
        content: "삭제될 답변입니다.",
      },
    });

    await prisma.answer.delete({
      where: { id: answer.id },
    });

    const deletedAnswer = await prisma.answer.findUnique({
      where: { id: answer.id },
    });
    expect(deletedAnswer).toBeNull();
  });

  it("should cascade delete answers when a user is deleted", async () => {
    await prisma.answer.create({
      data: {
        userId: testUser.id,
        questionId: testQuestion.id,
        content: "사용자와 함께 삭제될 답변",
      },
    });

    await prisma.user.delete({ where: { id: testUser.id } });

    const answers = await prisma.answer.findMany({
      where: { userId: testUser.id }, // 또는 questionId로도 확인 가능
    });
    expect(answers.length).toBe(0);
  });

  it("should cascade delete answers when a question is deleted", async () => {
    await prisma.answer.create({
      data: {
        userId: testUser.id,
        questionId: testQuestion.id,
        content: "질문과 함께 삭제될 답변",
      },
    });

    await prisma.question.delete({ where: { id: testQuestion.id } });

    const answers = await prisma.answer.findMany({
      where: { questionId: testQuestion.id }, // 또는 userId로도 확인 가능
    });
    expect(answers.length).toBe(0);
  });
});
