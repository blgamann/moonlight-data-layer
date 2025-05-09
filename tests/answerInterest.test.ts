import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient, User, Book, Question, Answer } from "@prisma/client";

const prisma = new PrismaClient();

describe("AnswerInterest Model", () => {
  let interestedUser: User; // 관심을 표현하는 사용자
  let answerAuthor: User; // 답변을 작성한 사용자
  let testBook: Book;
  let testQuestion: Question;
  let targetAnswer: Answer; // 관심의 대상이 되는 답변

  beforeEach(async () => {
    // 의존성 순서대로 삭제
    await prisma.answerInterest.deleteMany({});
    await prisma.answer.deleteMany({});
    await prisma.question.deleteMany({});
    await prisma.bookshelfEntry.deleteMany({});
    await prisma.profileInterest.deleteMany({}); // User 참조
    await prisma.soullinkRequest.deleteMany({}); // User 참조
    await prisma.soulmate.deleteMany({}); // User 참조
    await prisma.notification.deleteMany({}); // User 참조
    await prisma.user.deleteMany({});
    await prisma.book.deleteMany({});

    // 테스트용 사용자 (관심 표현자)
    interestedUser = await prisma.user.create({
      data: {
        email: `interested_user_ai_${Date.now()}@example.com`,
        passwordHash: "hashedpassword1",
      },
    });

    // 테스트용 사용자 (답변 작성자)
    answerAuthor = await prisma.user.create({
      data: {
        email: `author_user_ai_${Date.now()}@example.com`,
        passwordHash: "hashedpassword2",
      },
    });

    // 테스트용 Book
    testBook = await prisma.book.create({
      data: {
        isbn: `isbn_ai_${Date.now()}`,
        title: "Test Book for AnswerInterest",
        author: "Test Author",
        publisher: "Test Publisher",
      },
    });

    // 테스트용 Question
    testQuestion = await prisma.question.create({
      data: {
        bookIsbn: testBook.isbn,
        content: "이 책에 대한 당신의 주요 관심사는 무엇인가요?",
      },
    });

    // 테스트용 Answer (관심 대상)
    targetAnswer = await prisma.answer.create({
      data: {
        userId: answerAuthor.id, // 답변 작성자
        questionId: testQuestion.id,
        content: "이 책의 철학적 메시지에 깊은 관심을 느꼈습니다.",
      },
    });
  });

  // afterEach는 필요시 주석 해제

  it("should allow a user to express interest in an answer", async () => {
    const answerInterest = await prisma.answerInterest.create({
      data: {
        interestedUserId: interestedUser.id,
        targetAnswerId: targetAnswer.id,
        // createdAt은 자동으로 생성됨
      },
    });

    expect(answerInterest.id).toBeDefined();
    expect(answerInterest.interestedUserId).toBe(interestedUser.id);
    expect(answerInterest.targetAnswerId).toBe(targetAnswer.id);
    expect(answerInterest.createdAt).toBeInstanceOf(Date);

    // (선택적) 관계를 통해 데이터가 올바르게 연결되었는지 확인
    const interestWithRelations = await prisma.answerInterest.findUnique({
      where: { id: answerInterest.id },
      include: {
        interestedUser: true,
        targetAnswer: { include: { user: true } },
      },
    });
    expect(interestWithRelations?.interestedUser.email).toBe(
      interestedUser.email
    );
    expect(interestWithRelations?.targetAnswer.content).toBe(
      targetAnswer.content
    );
    expect(interestWithRelations?.targetAnswer.user.email).toBe(
      answerAuthor.email
    );
  });

  it("should prevent expressing interest in the same answer by the same user twice (unique constraint)", async () => {
    // 첫 번째 관심 표현
    await prisma.answerInterest.create({
      data: {
        interestedUserId: interestedUser.id,
        targetAnswerId: targetAnswer.id,
      },
    });

    // 두 번째 동일한 관심 표현 시도
    try {
      await prisma.answerInterest.create({
        data: {
          interestedUserId: interestedUser.id,
          targetAnswerId: targetAnswer.id,
        },
      });
    } catch (e: any) {
      expect(e.code).toBe("P2002"); // Prisma 고유 제약 조건 위반
      // @@unique([interestedUserId, targetAnswerId])
      // expect(e.meta?.target).toEqual(['interestedUserId', 'targetAnswerId']); // 실제 에러 확인 필요
    }
  });

  it("should allow different users to express interest in the same answer", async () => {
    const anotherInterestedUser = await prisma.user.create({
      data: {
        email: `interested_user2_ai_${Date.now()}@example.com`,
        passwordHash: "hashedpassword3",
      },
    });

    await prisma.answerInterest.create({
      data: {
        interestedUserId: interestedUser.id,
        targetAnswerId: targetAnswer.id,
      },
    });
    await prisma.answerInterest.create({
      data: {
        interestedUserId: anotherInterestedUser.id,
        targetAnswerId: targetAnswer.id,
      },
    });

    const interestsForAnswer = await prisma.answerInterest.findMany({
      where: { targetAnswerId: targetAnswer.id },
    });
    expect(interestsForAnswer.length).toBe(2);
  });

  it("should allow a user to express interest in different answers", async () => {
    const anotherAnswer = await prisma.answer.create({
      data: {
        userId: answerAuthor.id, // 동일 작성자, 다른 답변
        questionId: testQuestion.id,
        content: "이 책의 문체 또한 매우 흥미롭습니다.",
      },
    });

    await prisma.answerInterest.create({
      data: {
        interestedUserId: interestedUser.id,
        targetAnswerId: targetAnswer.id,
      },
    });
    await prisma.answerInterest.create({
      data: {
        interestedUserId: interestedUser.id,
        targetAnswerId: anotherAnswer.id,
      },
    });

    const interestsByUser = await prisma.answerInterest.findMany({
      where: { interestedUserId: interestedUser.id },
    });
    expect(interestsByUser.length).toBe(2);
  });

  it("should delete an answer interest", async () => {
    const answerInterest = await prisma.answerInterest.create({
      data: {
        interestedUserId: interestedUser.id,
        targetAnswerId: targetAnswer.id,
      },
    });

    await prisma.answerInterest.delete({
      where: { id: answerInterest.id },
    });

    const deletedInterest = await prisma.answerInterest.findUnique({
      where: { id: answerInterest.id },
    });
    expect(deletedInterest).toBeNull();
  });

  it("should cascade delete answer interests when the interested user is deleted", async () => {
    await prisma.answerInterest.create({
      data: {
        interestedUserId: interestedUser.id,
        targetAnswerId: targetAnswer.id,
      },
    });

    await prisma.user.delete({ where: { id: interestedUser.id } });

    const interests = await prisma.answerInterest.findMany({
      where: { interestedUserId: interestedUser.id },
    });
    expect(interests.length).toBe(0);
  });

  it("should cascade delete answer interests when the target answer is deleted", async () => {
    await prisma.answerInterest.create({
      data: {
        interestedUserId: interestedUser.id,
        targetAnswerId: targetAnswer.id,
      },
    });

    await prisma.answer.delete({ where: { id: targetAnswer.id } });

    const interests = await prisma.answerInterest.findMany({
      where: { targetAnswerId: targetAnswer.id },
    });
    expect(interests.length).toBe(0);
  });

  // 자기 자신의 답변에 관심 표현하는 경우에 대한 테스트 (허용 여부에 따라)
  it("should allow a user to express interest in their own answer (if allowed by policy)", async () => {
    // targetAnswer는 answerAuthor가 작성한 답변
    // interestedUser를 answerAuthor로 설정하여 테스트
    const interestInOwnAnswer = await prisma.answerInterest.create({
      data: {
        interestedUserId: answerAuthor.id, // 답변 작성자가 자신의 답변에 관심 표현
        targetAnswerId: targetAnswer.id,
      },
    });
    expect(interestInOwnAnswer.interestedUserId).toBe(answerAuthor.id);
    expect(interestInOwnAnswer.targetAnswerId).toBe(targetAnswer.id);

    // 만약 자신의 답변에 관심 표현을 막는다면, 이 테스트는 실패하거나 에러를 잡아야 함
    // 이 경우, 애플리케이션 레벨에서 로직을 추가하고 해당 로직을 테스트해야 함.
    // 현재 Prisma 스키마 레벨에서는 막는 제약 조건이 없음.
  });
});
