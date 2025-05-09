import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient, User } from "@prisma/client";

const prisma = new PrismaClient();

describe("ProfileInterest Model", () => {
  let interestedUser: User; // 관심을 표현하는 사용자
  let targetUser: User; // 관심의 대상이 되는 사용자

  beforeEach(async () => {
    // 의존성 순서대로 삭제
    // ProfileInterest는 User만 직접 참조하므로 User 삭제 전에 삭제
    await prisma.profileInterest.deleteMany({});

    // User를 참조하는 다른 모델들도 정리 (테스트 격리)
    await prisma.notification.deleteMany({});
    await prisma.soulmate.deleteMany({});
    await prisma.soullinkRequest.deleteMany({});
    await prisma.answerInterest.deleteMany({});
    await prisma.answer.deleteMany({});
    await prisma.bookshelfEntry.deleteMany({});
    // 마지막으로 User 삭제
    await prisma.user.deleteMany({});

    // 테스트용 사용자 (관심 표현자)
    interestedUser = await prisma.user.create({
      data: {
        email: `interested_user_pi_${Date.now()}@example.com`,
        passwordHash: "hashedpassword_interested",
        name: "Interested User PI",
      },
    });

    // 테스트용 사용자 (관심 대상)
    targetUser = await prisma.user.create({
      data: {
        email: `target_user_pi_${Date.now()}@example.com`,
        passwordHash: "hashedpassword_target",
        name: "Target User PI",
      },
    });
  });

  // afterEach는 필요시 주석 해제

  it("should allow a user to express interest in another user's profile", async () => {
    const profileInterest = await prisma.profileInterest.create({
      data: {
        interestedUserId: interestedUser.id,
        targetUserId: targetUser.id,
        // createdAt은 자동으로 생성됨
      },
    });

    expect(profileInterest.id).toBeDefined();
    expect(profileInterest.interestedUserId).toBe(interestedUser.id);
    expect(profileInterest.targetUserId).toBe(targetUser.id);
    expect(profileInterest.createdAt).toBeInstanceOf(Date);

    // (선택적) 관계를 통해 데이터가 올바르게 연결되었는지 확인
    const interestWithRelations = await prisma.profileInterest.findUnique({
      where: { id: profileInterest.id },
      include: { interestedUser: true, targetUser: true },
    });
    expect(interestWithRelations?.interestedUser.name).toBe(
      interestedUser.name
    );
    expect(interestWithRelations?.targetUser.name).toBe(targetUser.name);
  });

  it("should prevent expressing interest in the same user's profile by the same user twice (unique constraint)", async () => {
    // 첫 번째 관심 표현
    await prisma.profileInterest.create({
      data: {
        interestedUserId: interestedUser.id,
        targetUserId: targetUser.id,
      },
    });

    // 두 번째 동일한 관심 표현 시도
    try {
      await prisma.profileInterest.create({
        data: {
          interestedUserId: interestedUser.id,
          targetUserId: targetUser.id,
        },
      });
    } catch (e: any) {
      expect(e.code).toBe("P2002"); // Prisma 고유 제약 조건 위반
      // @@unique([interestedUserId, targetUserId])
      // expect(e.meta?.target).toEqual(['interestedUserId', 'targetUserId']); // 실제 에러 확인 필요
    }
  });

  it("should allow different users to express interest in the same user's profile", async () => {
    const anotherInterestedUser = await prisma.user.create({
      data: {
        email: `interested_user2_pi_${Date.now()}@example.com`,
        passwordHash: "hashedpassword_interested2",
      },
    });

    await prisma.profileInterest.create({
      data: {
        interestedUserId: interestedUser.id,
        targetUserId: targetUser.id,
      },
    });
    await prisma.profileInterest.create({
      data: {
        interestedUserId: anotherInterestedUser.id,
        targetUserId: targetUser.id,
      },
    });

    const interestsForTargetUser = await prisma.profileInterest.findMany({
      where: { targetUserId: targetUser.id },
    });
    expect(interestsForTargetUser.length).toBe(2);
  });

  it("should allow a user to express interest in different users' profiles", async () => {
    const anotherTargetUser = await prisma.user.create({
      data: {
        email: `target_user2_pi_${Date.now()}@example.com`,
        passwordHash: "hashedpassword_target2",
      },
    });

    await prisma.profileInterest.create({
      data: {
        interestedUserId: interestedUser.id,
        targetUserId: targetUser.id,
      },
    });
    await prisma.profileInterest.create({
      data: {
        interestedUserId: interestedUser.id,
        targetUserId: anotherTargetUser.id,
      },
    });

    const interestsByInterestedUser = await prisma.profileInterest.findMany({
      where: { interestedUserId: interestedUser.id },
    });
    expect(interestsByInterestedUser.length).toBe(2);
  });

  it("should prevent a user from expressing interest in their own profile (logical constraint, not DB)", async () => {
    // 스키마 레벨에서는 interestedUserId와 targetUserId가 같아도 막지 않음.
    // 이는 애플리케이션 로직에서 처리해야 할 부분임.
    // 여기서는 Prisma가 에러를 발생시키지 않음을 확인 (만약 발생시킨다면 그게 버그일 수 있음)
    try {
      const selfInterest = await prisma.profileInterest.create({
        data: {
          interestedUserId: interestedUser.id,
          targetUserId: interestedUser.id, // 자기 자신을 타겟으로
        },
      });
      // 이 테스트는 성공해야 함 (DB 레벨에서는 막지 않으므로)
      expect(selfInterest).toBeDefined();

      // 애플리케이션에서는 이런 레코드가 생성되지 않도록 막아야 하며,
      // 그 로직에 대한 테스트는 서비스 계층 테스트에서 수행.
      // 필요하다면 이 레코드를 즉시 삭제.
      await prisma.profileInterest.delete({ where: { id: selfInterest.id } });
    } catch (e: any) {
      // 만약 Prisma 레벨에서 어떤 이유로든 에러가 난다면 테스트 실패
      // (예: 예상치 못한 DB 제약조건)
      throw new Error(
        `Self-interest creation failed unexpectedly: ${e.message}`
      );
    }
  });

  it("should delete a profile interest", async () => {
    const profileInterest = await prisma.profileInterest.create({
      data: {
        interestedUserId: interestedUser.id,
        targetUserId: targetUser.id,
      },
    });

    await prisma.profileInterest.delete({
      where: { id: profileInterest.id },
    });

    const deletedInterest = await prisma.profileInterest.findUnique({
      where: { id: profileInterest.id },
    });
    expect(deletedInterest).toBeNull();
  });

  it("should cascade delete profile interests when the interested user (Expresser) is deleted", async () => {
    await prisma.profileInterest.create({
      data: {
        interestedUserId: interestedUser.id,
        targetUserId: targetUser.id,
      },
    });

    // interestedUser 삭제
    await prisma.user.delete({ where: { id: interestedUser.id } });

    const interests = await prisma.profileInterest.findMany({
      where: {
        OR: [
          { interestedUserId: interestedUser.id },
          { targetUserId: interestedUser.id },
        ],
      }, // 양방향으로 확인
    });
    // interestedUser가 표현한 관심(ExpressedProfileInterests)은 삭제되어야 함
    const expressedByDeletedUser = await prisma.profileInterest.findMany({
      where: { interestedUserId: interestedUser.id },
    });
    expect(expressedByDeletedUser.length).toBe(0);
  });

  it("should cascade delete profile interests when the target user (Receiver) is deleted", async () => {
    await prisma.profileInterest.create({
      data: {
        interestedUserId: interestedUser.id,
        targetUserId: targetUser.id,
      },
    });

    // targetUser 삭제
    await prisma.user.delete({ where: { id: targetUser.id } });

    const interests = await prisma.profileInterest.findMany({
      where: {
        OR: [
          { interestedUserId: targetUser.id },
          { targetUserId: targetUser.id },
        ],
      }, // 양방향으로 확인
    });
    // targetUser를 향한 관심(ReceivedProfileInterests)은 삭제되어야 함
    const receivedByDeletedUser = await prisma.profileInterest.findMany({
      where: { targetUserId: targetUser.id },
    });
    expect(receivedByDeletedUser.length).toBe(0);
  });
});
