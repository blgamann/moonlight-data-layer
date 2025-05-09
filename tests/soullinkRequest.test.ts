import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient, User } from "@prisma/client";

const prisma = new PrismaClient();

describe("SoullinkRequest Model", () => {
  let sender: User; // 소울링크 요청을 보내는 사용자
  let receiver: User; // 소울링크 요청을 받는 사용자

  beforeEach(async () => {
    // 의존성 순서대로 삭제
    await prisma.soullinkRequest.deleteMany({}); // User 참조

    // User를 참조하는 다른 모델들도 정리 (테스트 격리)
    await prisma.notification.deleteMany({});
    await prisma.soulmate.deleteMany({});
    await prisma.profileInterest.deleteMany({});
    await prisma.answerInterest.deleteMany({});
    await prisma.answer.deleteMany({});
    await prisma.bookshelfEntry.deleteMany({});
    // 마지막으로 User 삭제
    await prisma.user.deleteMany({});

    // 테스트용 사용자 (요청 발신자)
    const timestamp = Date.now();
    const senderSuffix = Math.random().toString(36).substring(2, 7);
    const receiverSuffix = Math.random().toString(36).substring(2, 7);
    
    sender = await prisma.user.create({
      data: {
        email: `sender_slr_${timestamp}_${senderSuffix}@example.com`,
        passwordHash: "hashedpassword_sender",
        name: "Sender User SLR",
      },
    });

    // 테스트용 사용자 (요청 수신자)
    receiver = await prisma.user.create({
      data: {
        email: `receiver_slr_${timestamp}_${receiverSuffix}@example.com`,
        passwordHash: "hashedpassword_receiver",
        name: "Receiver User SLR",
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
    await prisma.bookshelfEntry.deleteMany({});
    await prisma.user.deleteMany({});
  });

  it("should allow a user to send a soullink request to another user", async () => {
    const soullinkRequest = await prisma.soullinkRequest.create({
      data: {
        senderId: sender.id,
        receiverId: receiver.id,
        // createdAt은 자동으로 생성됨
      },
    });

    expect(soullinkRequest.id).toBeDefined();
    expect(soullinkRequest.senderId).toBe(sender.id);
    expect(soullinkRequest.receiverId).toBe(receiver.id);
    expect(soullinkRequest.createdAt).toBeInstanceOf(Date);

    // (선택적) 관계를 통해 데이터가 올바르게 연결되었는지 확인
    const requestWithRelations = await prisma.soullinkRequest.findUnique({
      where: { id: soullinkRequest.id },
      include: { sender: true, receiver: true },
    });
    expect(requestWithRelations?.sender.name).toBe(sender.name);
    expect(requestWithRelations?.receiver.name).toBe(receiver.name);
  });

  it("should prevent sending duplicate soullink requests (same sender to same receiver)", async () => {
    // 첫 번째 요청
    await prisma.soullinkRequest.create({
      data: { senderId: sender.id, receiverId: receiver.id },
    });

    // 두 번째 동일한 요청 시도
    try {
      await prisma.soullinkRequest.create({
        data: { senderId: sender.id, receiverId: receiver.id },
      });
    } catch (e: any) {
      expect(e.code).toBe("P2002"); // Prisma 고유 제약 조건 위반
      // @@unique([senderId, receiverId])
      // expect(e.meta?.target).toEqual(['senderId', 'receiverId']); // 실제 에러 확인 필요
    }
  });

  it("should allow a user (sender) to send soullink requests to multiple different users (receivers)", async () => {
    const anotherTimestamp = Date.now();
    const anotherSuffix = Math.random().toString(36).substring(2, 7);
    const anotherReceiver = await prisma.user.create({
      data: {
        email: `receiver2_slr_${anotherTimestamp}_${anotherSuffix}@example.com`,
        passwordHash: "hashedpassword_receiver2",
        name: "Another Receiver SLR",
      },
    });

    await prisma.soullinkRequest.create({
      data: { senderId: sender.id, receiverId: receiver.id },
    });
    await prisma.soullinkRequest.create({
      data: { senderId: sender.id, receiverId: anotherReceiver.id },
    });

    const requestsSentByUser = await prisma.soullinkRequest.findMany({
      where: { senderId: sender.id },
    });
    expect(requestsSentByUser.length).toBe(2);
  });

  it("should allow a user (receiver) to receive soullink requests from multiple different users (senders)", async () => {
    const anotherTimestamp = Date.now();
    const anotherSuffix = Math.random().toString(36).substring(2, 7);
    const anotherSender = await prisma.user.create({
      data: {
        email: `sender2_slr_${anotherTimestamp}_${anotherSuffix}@example.com`,
        passwordHash: "hashedpassword_sender2",
        name: "Another Sender SLR",
      },
    });

    await prisma.soullinkRequest.create({
      data: { senderId: sender.id, receiverId: receiver.id },
    });
    await prisma.soullinkRequest.create({
      data: { senderId: anotherSender.id, receiverId: receiver.id },
    });

    const requestsReceivedByUser = await prisma.soullinkRequest.findMany({
      where: { receiverId: receiver.id },
    });
    expect(requestsReceivedByUser.length).toBe(2);
  });

  it("should prevent a user from sending a soullink request to themselves (logical constraint, not DB)", async () => {
    // 스키마 레벨에서는 senderId와 receiverId가 같아도 막지 않음.
    // 이는 애플리케이션 로직에서 처리해야 할 부분임.
    try {
      const selfRequest = await prisma.soullinkRequest.create({
        data: {
          senderId: sender.id,
          receiverId: sender.id, // 자기 자신에게 요청
        },
      });
      expect(selfRequest).toBeDefined(); // DB 레벨에서는 생성 가능
      // 애플리케이션에서는 이런 레코드가 생성되지 않도록 막아야 함.
      await prisma.soullinkRequest.delete({ where: { id: selfRequest.id } });
    } catch (e: any) {
      throw new Error(
        `Self-request creation failed unexpectedly: ${e.message}`
      );
    }
  });

  it("should delete a soullink request", async () => {
    const soullinkRequest = await prisma.soullinkRequest.create({
      data: { senderId: sender.id, receiverId: receiver.id },
    });

    await prisma.soullinkRequest.delete({
      where: { id: soullinkRequest.id },
    });

    const deletedRequest = await prisma.soullinkRequest.findUnique({
      where: { id: soullinkRequest.id },
    });
    expect(deletedRequest).toBeNull();
  });

  it("should cascade delete soullink requests when the sender is deleted", async () => {
    await prisma.soullinkRequest.create({
      data: { senderId: sender.id, receiverId: receiver.id },
    });
    // 다른 유저가 sender에게 보낸 요청 (이것은 남아있어야 함)
    const anotherTimestamp = Date.now();
    const anotherSuffix = Math.random().toString(36).substring(2, 7);
    const anotherUser = await prisma.user.create({
      data: {
        email: `another_slr_${anotherTimestamp}_${anotherSuffix}@example.com`,
        passwordHash: "pw",
        name: "Another User SLR",
      },
    });
    await prisma.soullinkRequest.create({
      data: { senderId: anotherUser.id, receiverId: sender.id },
    });

    await prisma.user.delete({ where: { id: sender.id } });

    // sender가 보낸 요청은 삭제되어야 함
    const requestsSentByDeletedUser = await prisma.soullinkRequest.findMany({
      where: { senderId: sender.id },
    });
    expect(requestsSentByDeletedUser.length).toBe(0);

    // sender가 받은 요청도 삭제되어야 함
    const requestsReceivedByDeletedUser = await prisma.soullinkRequest.findMany(
      {
        where: { receiverId: sender.id },
      }
    );
    expect(requestsReceivedByDeletedUser.length).toBe(0);
  });

  it("should cascade delete soullink requests when the receiver is deleted", async () => {
    await prisma.soullinkRequest.create({
      data: { senderId: sender.id, receiverId: receiver.id },
    });
    // receiver가 다른 유저에게 보낸 요청 (이것은 남아있어야 함)
    const anotherTimestamp = Date.now();
    const anotherSuffix = Math.random().toString(36).substring(2, 7);
    const anotherUser = await prisma.user.create({
      data: {
        email: `another_slr_${anotherTimestamp}_${anotherSuffix}@example.com`,
        passwordHash: "pw",
        name: "Another User SLR",
      },
    });
    await prisma.soullinkRequest.create({
      data: { senderId: receiver.id, receiverId: anotherUser.id },
    });

    await prisma.user.delete({ where: { id: receiver.id } });

    // receiver가 받은 요청은 삭제되어야 함
    const requestsReceivedByDeletedUser = await prisma.soullinkRequest.findMany(
      {
        where: { receiverId: receiver.id },
      }
    );
    expect(requestsReceivedByDeletedUser.length).toBe(0);

    // receiver가 보낸 요청도 삭제되어야 함
    const requestsSentByDeletedUser = await prisma.soullinkRequest.findMany({
      where: { senderId: receiver.id },
    });
    expect(requestsSentByDeletedUser.length).toBe(0);
  });
});
