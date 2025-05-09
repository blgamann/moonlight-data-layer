import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient, User, NotificationType } from "@prisma/client";

const prisma = new PrismaClient();

describe("Notification Integration", () => {
  let userA: User;
  let userB: User;

  beforeEach(async () => {
    await prisma.notification.deleteMany({});
    await prisma.soulmate.deleteMany({});
    await prisma.soullinkRequest.deleteMany({});
    await prisma.profileInterest.deleteMany({});
    await prisma.answerInterest.deleteMany({});
    await prisma.answer.deleteMany({});
    await prisma.question.deleteMany({});
    await prisma.bookshelfEntry.deleteMany({});
    await prisma.book.deleteMany({});
    await prisma.user.deleteMany({});

    const timestamp = Date.now();
    const randomSuffixA = Math.random().toString(36).substring(2, 7);
    const randomSuffixB = Math.random().toString(36).substring(2, 7);
    userA = await prisma.user.create({
      data: {
        email: `userA_noti_${timestamp}_${randomSuffixA}@example.com`,
        passwordHash: "hashed_A",
        name: "User A Notification",
      },
    });
    userB = await prisma.user.create({
      data: {
        email: `userB_noti_${timestamp}_${randomSuffixB}@example.com`,
        passwordHash: "hashed_B",
        name: "User B Notification",
      },
    });
  });
  
  afterEach(async () => {
    await prisma.notification.deleteMany({});
    await prisma.soulmate.deleteMany({});
    await prisma.soullinkRequest.deleteMany({});
    await prisma.profileInterest.deleteMany({});
    await prisma.answerInterest.deleteMany({});
    await prisma.answer.deleteMany({});
    await prisma.question.deleteMany({});
    await prisma.bookshelfEntry.deleteMany({});
    await prisma.book.deleteMany({});
    await prisma.user.deleteMany({});
  });

  it("should create MUTUAL_PROFILE_INTEREST notification when two users express interest in each other", async () => {
    await prisma.profileInterest.create({
      data: {
        interestedUserId: userA.id,
        targetUserId: userB.id,
      },
    });

    await prisma.profileInterest.create({
      data: {
        interestedUserId: userB.id,
        targetUserId: userA.id,
      },
    });

    const interestAtoB = await prisma.profileInterest.findFirst({
      where: {
        interestedUserId: userA.id,
        targetUserId: userB.id,
      },
    });
    const interestBtoA = await prisma.profileInterest.findFirst({
      where: {
        interestedUserId: userB.id,
        targetUserId: userA.id,
      },
    });

    expect(interestAtoB).not.toBeNull();
    expect(interestBtoA).not.toBeNull();

    const notificationForA = await prisma.notification.create({
      data: {
        userId: userA.id,
        type: NotificationType.MUTUAL_PROFILE_INTEREST,
        content: `${userB.name}님과 서로 관심을 표현했습니다.`,
        relatedUserId: userB.id,
      },
    });

    const notificationForB = await prisma.notification.create({
      data: {
        userId: userB.id,
        type: NotificationType.MUTUAL_PROFILE_INTEREST,
        content: `${userA.name}님과 서로 관심을 표현했습니다.`,
        relatedUserId: userA.id,
      },
    });

    expect(notificationForA.type).toBe(NotificationType.MUTUAL_PROFILE_INTEREST);
    expect(notificationForA.relatedUserId).toBe(userB.id);
    expect(notificationForB.type).toBe(NotificationType.MUTUAL_PROFILE_INTEREST);
    expect(notificationForB.relatedUserId).toBe(userA.id);

    const userANotifications = await prisma.notification.findMany({
      where: { userId: userA.id },
    });
    const userBNotifications = await prisma.notification.findMany({
      where: { userId: userB.id },
    });

    expect(userANotifications.length).toBe(1);
    expect(userBNotifications.length).toBe(1);
  });

  it("should create SOULMATE_FORMED notification when two users send soullink requests to each other", async () => {
    await prisma.soullinkRequest.create({
      data: {
        senderId: userA.id,
        receiverId: userB.id,
      },
    });

    await prisma.soullinkRequest.create({
      data: {
        senderId: userB.id,
        receiverId: userA.id,
      },
    });

    const requestAtoB = await prisma.soullinkRequest.findFirst({
      where: {
        senderId: userA.id,
        receiverId: userB.id,
      },
    });
    const requestBtoA = await prisma.soullinkRequest.findFirst({
      where: {
        senderId: userB.id,
        receiverId: userA.id,
      },
    });

    expect(requestAtoB).not.toBeNull();
    expect(requestBtoA).not.toBeNull();

    const userAId = userA.id < userB.id ? userA.id : userB.id;
    const userBId = userA.id < userB.id ? userB.id : userA.id;
    
    const soulmate = await prisma.soulmate.create({
      data: {
        userAId,
        userBId,
      },
    });

    const notificationForA = await prisma.notification.create({
      data: {
        userId: userA.id,
        type: NotificationType.SOULMATE_FORMED,
        content: `${userB.name}님과 소울메이트가 되었습니다.`,
        relatedUserId: userB.id,
        relatedSoulmateId: soulmate.id,
      },
    });

    const notificationForB = await prisma.notification.create({
      data: {
        userId: userB.id,
        type: NotificationType.SOULMATE_FORMED,
        content: `${userA.name}님과 소울메이트가 되었습니다.`,
        relatedUserId: userA.id,
        relatedSoulmateId: soulmate.id,
      },
    });

    expect(notificationForA.type).toBe(NotificationType.SOULMATE_FORMED);
    expect(notificationForA.relatedUserId).toBe(userB.id);
    expect(notificationForA.relatedSoulmateId).toBe(soulmate.id);
    
    expect(notificationForB.type).toBe(NotificationType.SOULMATE_FORMED);
    expect(notificationForB.relatedUserId).toBe(userA.id);
    expect(notificationForB.relatedSoulmateId).toBe(soulmate.id);

    const userANotifications = await prisma.notification.findMany({
      where: { userId: userA.id },
    });
    const userBNotifications = await prisma.notification.findMany({
      where: { userId: userB.id },
    });

    expect(userANotifications.length).toBe(1);
    expect(userBNotifications.length).toBe(1);
  });

  it("should handle the complete flow from mutual interest to soulmate formation with notifications", async () => {
    await prisma.profileInterest.create({
      data: {
        interestedUserId: userA.id,
        targetUserId: userB.id,
      },
    });
    await prisma.profileInterest.create({
      data: {
        interestedUserId: userB.id,
        targetUserId: userA.id,
      },
    });

    await prisma.notification.create({
      data: {
        userId: userA.id,
        type: NotificationType.MUTUAL_PROFILE_INTEREST,
        content: `${userB.name}님과 서로 관심을 표현했습니다.`,
        relatedUserId: userB.id,
      },
    });
    await prisma.notification.create({
      data: {
        userId: userB.id,
        type: NotificationType.MUTUAL_PROFILE_INTEREST,
        content: `${userA.name}님과 서로 관심을 표현했습니다.`,
        relatedUserId: userA.id,
      },
    });

    await prisma.soullinkRequest.create({
      data: {
        senderId: userA.id,
        receiverId: userB.id,
      },
    });
    await prisma.soullinkRequest.create({
      data: {
        senderId: userB.id,
        receiverId: userA.id,
      },
    });

    const userAId = userA.id < userB.id ? userA.id : userB.id;
    const userBId = userA.id < userB.id ? userB.id : userA.id;
    
    const soulmate = await prisma.soulmate.create({
      data: {
        userAId,
        userBId,
      },
    });

    await prisma.notification.create({
      data: {
        userId: userA.id,
        type: NotificationType.SOULMATE_FORMED,
        content: `${userB.name}님과 소울메이트가 되었습니다.`,
        relatedUserId: userB.id,
        relatedSoulmateId: soulmate.id,
      },
    });
    await prisma.notification.create({
      data: {
        userId: userB.id,
        type: NotificationType.SOULMATE_FORMED,
        content: `${userA.name}님과 소울메이트가 되었습니다.`,
        relatedUserId: userA.id,
        relatedSoulmateId: soulmate.id,
      },
    });

    const userANotifications = await prisma.notification.findMany({
      where: { userId: userA.id },
      orderBy: { createdAt: 'asc' },
    });
    const userBNotifications = await prisma.notification.findMany({
      where: { userId: userB.id },
      orderBy: { createdAt: 'asc' },
    });

    expect(userANotifications.length).toBe(2);
    expect(userBNotifications.length).toBe(2);
    
    expect(userANotifications[0].type).toBe(NotificationType.MUTUAL_PROFILE_INTEREST);
    expect(userANotifications[1].type).toBe(NotificationType.SOULMATE_FORMED);
    
    expect(userBNotifications[0].type).toBe(NotificationType.MUTUAL_PROFILE_INTEREST);
    expect(userBNotifications[1].type).toBe(NotificationType.SOULMATE_FORMED);
  });
});
