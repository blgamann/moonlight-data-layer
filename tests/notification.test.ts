import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  PrismaClient,
  User,
  Book,
  Question,
  Answer,
  Soulmate,
  NotificationType,
} from "@prisma/client";

const prisma = new PrismaClient();

describe("Notification Model", () => {
  let testUser: User; // 알림을 받는 사용자
  let relatedUser: User; // 알림과 관련된 다른 사용자 (예: 프로필 관심을 보낸 사용자)
  let testBook: Book;
  let testQuestion: Question;
  let testAnswer: Answer;
  let testSoulmate: Soulmate;

  beforeEach(async () => {
    // Notification은 다른 모델을 직접 참조하지 않으므로 먼저 삭제 가능 (User는 제외)
    await prisma.notification.deleteMany({});

    // 다른 모델들도 순서대로 정리
    await prisma.soulmate.deleteMany({});
    await prisma.soullinkRequest.deleteMany({});
    await prisma.profileInterest.deleteMany({});
    await prisma.answerInterest.deleteMany({});
    await prisma.answer.deleteMany({});
    await prisma.question.deleteMany({});
    await prisma.bookshelfEntry.deleteMany({});
    await prisma.user.deleteMany({}); // Notification이 User를 참조하므로 User는 나중에
    await prisma.book.deleteMany({});

    // 테스트용 데이터 생성
    testUser = await prisma.user.create({
      data: {
        email: `noti_user_${Date.now()}@example.com`,
        passwordHash: "pw",
      },
    });
    relatedUser = await prisma.user.create({
      data: {
        email: `related_user_noti_${Date.now()}@example.com`,
        passwordHash: "pw",
      },
    });
    testBook = await prisma.book.create({
      data: {
        isbn: `isbn_noti_${Date.now()}`,
        title: "Noti Book",
        author: "A",
        publisher: "P",
      },
    });
    testQuestion = await prisma.question.create({
      data: { bookIsbn: testBook.isbn, content: "Noti Question?" },
    });
    testAnswer = await prisma.answer.create({
      data: {
        userId: relatedUser.id,
        questionId: testQuestion.id,
        content: "Noti Answer",
      },
    });
    // Soulmate 생성을 위해 userAId < userBId 규칙 적용
    const userAId = testUser.id < relatedUser.id ? testUser.id : relatedUser.id;
    const userBId = testUser.id < relatedUser.id ? relatedUser.id : testUser.id;
    testSoulmate = await prisma.soulmate.create({
      data: { userAId: userAId, userBId: userBId },
    });
  });

  // afterEach는 필요시 주석 해제

  it("should create a new notification for a user", async () => {
    const notification = await prisma.notification.create({
      data: {
        userId: testUser.id,
        type: NotificationType.MUTUAL_PROFILE_INTEREST,
        content: "새로운 상호 관심이 발생했습니다!",
        relatedUserId: relatedUser.id,
        // createdAt, isRead는 자동으로 생성/기본값 설정됨
      },
    });

    expect(notification.id).toBeDefined();
    expect(notification.userId).toBe(testUser.id);
    expect(notification.type).toBe(NotificationType.MUTUAL_PROFILE_INTEREST);
    expect(notification.content).toBe("새로운 상호 관심이 발생했습니다!");
    expect(notification.relatedUserId).toBe(relatedUser.id);
    expect(notification.relatedBookIsbn).toBeNull(); // 제공하지 않았으므로 null
    expect(notification.isRead).toBe(false); // 기본값
    expect(notification.createdAt).toBeInstanceOf(Date);

    // (선택적) User와의 관계 확인
    const notiWithUser = await prisma.notification.findUnique({
      where: { id: notification.id },
      include: { user: true },
    });
    expect(notiWithUser?.user.email).toBe(testUser.email);
  });

  it("should create a notification with all optional related IDs", async () => {
    const notification = await prisma.notification.create({
      data: {
        userId: testUser.id,
        type: NotificationType.SOULMATE_FORMED,
        content: `${relatedUser.email}님과 소울메이트가 되었습니다.`,
        relatedUserId: relatedUser.id,
        relatedBookIsbn: testBook.isbn,
        relatedQuestionId: testQuestion.id,
        relatedAnswerId: testAnswer.id,
        relatedSoulmateId: testSoulmate.id,
      },
    });

    expect(notification.relatedUserId).toBe(relatedUser.id);
    expect(notification.relatedBookIsbn).toBe(testBook.isbn);
    expect(notification.relatedQuestionId).toBe(testQuestion.id);
    expect(notification.relatedAnswerId).toBe(testAnswer.id);
    expect(notification.relatedSoulmateId).toBe(testSoulmate.id);
  });

  it("should find all notifications for a specific user", async () => {
    await prisma.notification.create({
      data: {
        userId: testUser.id,
        type: NotificationType.MUTUAL_PROFILE_INTEREST,
        content: "알림1",
      },
    });
    await prisma.notification.create({
      data: {
        userId: testUser.id,
        type: NotificationType.SOULMATE_FORMED,
        content: "알림2",
      },
    });
    // 다른 사용자의 알림 (이것은 조회되지 않아야 함)
    const anotherUserForNoti = await prisma.user.create({
      data: {
        email: `other_noti_user_${Date.now()}@example.com`,
        passwordHash: "pw",
      },
    });
    await prisma.notification.create({
      data: {
        userId: anotherUserForNoti.id,
        type: NotificationType.MUTUAL_PROFILE_INTEREST,
        content: "다른 사용자 알림",
      },
    });

    const userNotifications = await prisma.notification.findMany({
      where: { userId: testUser.id },
      orderBy: { createdAt: "desc" }, // 최신순 정렬
    });

    expect(userNotifications.length).toBe(2);
    expect(userNotifications[0].content).toBe("알림2"); // 최신순이므로
    expect(userNotifications[1].content).toBe("알림1");
  });

  it("should find unread notifications for a user", async () => {
    await prisma.notification.create({
      data: {
        userId: testUser.id,
        type: NotificationType.MUTUAL_PROFILE_INTEREST,
        content: "안 읽은 알림",
        isRead: false,
      },
    });
    await prisma.notification.create({
      data: {
        userId: testUser.id,
        type: NotificationType.SOULMATE_FORMED,
        content: "읽은 알림",
        isRead: true,
      },
    });

    const unreadNotifications = await prisma.notification.findMany({
      where: { userId: testUser.id, isRead: false },
    });

    expect(unreadNotifications.length).toBe(1);
    expect(unreadNotifications[0].content).toBe("안 읽은 알림");
  });

  it("should update the isRead status of a notification", async () => {
    const notification = await prisma.notification.create({
      data: {
        userId: testUser.id,
        type: NotificationType.MUTUAL_PROFILE_INTEREST,
        content: "읽을 알림",
      },
    });
    expect(notification.isRead).toBe(false);

    const updatedNotification = await prisma.notification.update({
      where: { id: notification.id },
      data: { isRead: true },
    });

    expect(updatedNotification.isRead).toBe(true);
  });

  it("should delete a notification", async () => {
    const notification = await prisma.notification.create({
      data: {
        userId: testUser.id,
        type: NotificationType.MUTUAL_PROFILE_INTEREST,
        content: "삭제될 알림",
      },
    });

    await prisma.notification.delete({
      where: { id: notification.id },
    });

    const deletedNotification = await prisma.notification.findUnique({
      where: { id: notification.id },
    });
    expect(deletedNotification).toBeNull();
  });

  it("should cascade delete notifications when the owning user is deleted", async () => {
    await prisma.notification.create({
      data: {
        userId: testUser.id,
        type: NotificationType.MUTUAL_PROFILE_INTEREST,
        content: "사용자와 함께 삭제될 알림",
      },
    });
    // 다른 사용자의 알림은 남아 있어야 함
    const otherUser = await prisma.user.create({
      data: {
        email: `other_del_user_${Date.now()}@example.com`,
        passwordHash: "pw",
      },
    });
    const otherNoti = await prisma.notification.create({
      data: {
        userId: otherUser.id,
        type: NotificationType.MUTUAL_PROFILE_INTEREST,
        content: "남아있을 알림",
      },
    });

    await prisma.user.delete({ where: { id: testUser.id } });

    const userNotifications = await prisma.notification.findMany({
      where: { userId: testUser.id },
    });
    expect(userNotifications.length).toBe(0);

    const remainingNotification = await prisma.notification.findUnique({
      where: { id: otherNoti.id },
    });
    expect(remainingNotification).not.toBeNull();
  });

  // 만약 relatedUserId 등이 삭제될 때 알림도 삭제되어야 한다면, 해당 테스트 케이스 추가
  // 현재 스키마에서는 Notification.relatedUserId 등은 User.id를 직접 참조하는 @relation이 없으므로,
  // relatedUser가 삭제되어도 Notification은 자동으로 삭제되지 않음.
  // 이는 "느슨한 연결(loose coupling)"로, 알림 기록을 유지하는 데 유리할 수 있음.
  // 만약 관련 객체 삭제 시 알림도 삭제하고 싶다면, 애플리케이션 로직에서 처리하거나
  // 스키마에 @relation onDelete: Cascade를 추가해야 함 (현재 스키마에는 없음).
  it("should NOT automatically delete notification if relatedUser is deleted (due to no direct @relation)", async () => {
    const notification = await prisma.notification.create({
      data: {
        userId: testUser.id,
        type: NotificationType.MUTUAL_PROFILE_INTEREST,
        relatedUserId: relatedUser.id, // relatedUser는 beforeEach에서 생성
      },
    });

    // relatedUser 삭제
    await prisma.user.delete({ where: { id: relatedUser.id } });

    const foundNotification = await prisma.notification.findUnique({
      where: { id: notification.id },
    });
    // Notification은 여전히 존재해야 함. relatedUserId는 이제 존재하지 않는 User의 ID를 가리키게 됨.
    expect(foundNotification).not.toBeNull();
    expect(foundNotification?.relatedUserId).toBe(relatedUser.id); // ID는 그대로 남아있음
  });
});
