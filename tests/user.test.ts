import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
// 비밀번호 해싱을 위한 라이브러리 (실제 서비스에서 사용하는 것과 동일한 것을 사용)
// 예시: bcrypt. 실제 프로젝트에 맞게 수정하세요.
// import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// 테스트용 비밀번호 해시 (실제로는 bcrypt.hashSync 등을 사용)
// const MOCK_PASSWORD_HASH = 'hashed_password_for_testing';
// 실제 해싱 함수를 사용한다면:
// const SALT_ROUNDS = 10; // bcrypt 예시

describe("User Model", () => {
  beforeEach(async () => {
    // User를 참조하는 모든 모델의 데이터를 먼저 삭제해야 합니다.
    // 순서 중요: User를 참조하는 것들 -> User
    await prisma.notification.deleteMany({});
    await prisma.soulmate.deleteMany({}); // UserA, UserB
    await prisma.soullinkRequest.deleteMany({}); // sender, receiver
    await prisma.answerInterest.deleteMany({}); // interestedUser
    await prisma.profileInterest.deleteMany({}); // interestedUser, targetUser
    await prisma.answer.deleteMany({}); // user
    await prisma.bookshelfEntry.deleteMany({}); // user
    // User 삭제
    await prisma.user.deleteMany({});
  });

  // afterEach는 필요시 주석 해제

  it("should create a new user successfully", async () => {
    const newUserEmail = `testuser_${Date.now()}@example.com`; // 고유한 이메일 생성
    const rawPassword = "password123";
    // const passwordHash = await bcrypt.hash(rawPassword, SALT_ROUNDS); // 실제 해싱
    const passwordHash = "dummy_hashed_password"; // 테스트용 간단한 해시

    const newUserData = {
      email: newUserEmail,
      passwordHash: passwordHash,
      name: "Test User",
      image: "http://example.com/avatar.png",
      bio: "This is a test bio.",
    };

    const createdUser = await prisma.user.create({
      data: newUserData,
    });

    expect(createdUser.id).toBeDefined();
    expect(createdUser.email).toBe(newUserData.email);
    expect(createdUser.passwordHash).toBe(newUserData.passwordHash);
    expect(createdUser.name).toBe(newUserData.name);
    expect(createdUser.image).toBe(newUserData.image);
    expect(createdUser.bio).toBe(newUserData.bio);
    expect(createdUser.createdAt).toBeInstanceOf(Date);
    expect(createdUser.updatedAt).toBeInstanceOf(Date);
    expect(createdUser.lastLoginAt).toBeNull(); // 초기 생성 시 null
  });

  it("should prevent creating a user with a duplicate email", async () => {
    const duplicateEmail = `duplicate_${Date.now()}@example.com`;
    // const passwordHash = await bcrypt.hash('password123', SALT_ROUNDS);
    const passwordHash = "dummy_hashed_password";

    const userData = {
      email: duplicateEmail,
      passwordHash: passwordHash,
    };

    // 첫 번째 유저 생성
    await prisma.user.create({ data: userData });

    // 동일한 이메일로 두 번째 유저 생성 시도
    try {
      await prisma.user.create({ data: userData });
    } catch (e: any) {
      expect(e.code).toBe("P2002"); // Prisma 고유 제약 조건 위반 에러 코드
      expect(e.meta?.target).toContain("email");
    }
  });

  it("should find a user by email", async () => {
    const userEmail = `findme_${Date.now()}@example.com`;
    // const passwordHash = await bcrypt.hash('password123', SALT_ROUNDS);
    const passwordHash = "dummy_hashed_password";

    const userData = {
      email: userEmail,
      passwordHash: passwordHash,
      name: "Find Me User",
    };
    await prisma.user.create({ data: userData });

    const foundUser = await prisma.user.findUnique({
      where: { email: userEmail },
    });

    expect(foundUser).not.toBeNull();
    expect(foundUser?.name).toBe(userData.name);
  });

  it("should update a user (e.g., name, bio, lastLoginAt)", async () => {
    const userEmail = `update_${Date.now()}@example.com`;
    // const passwordHash = await bcrypt.hash('initial_password', SALT_ROUNDS);
    const passwordHash = "dummy_initial_hashed_password";

    const initialUser = await prisma.user.create({
      data: {
        email: userEmail,
        passwordHash: passwordHash,
        name: "Initial Name",
      },
    });

    const updatedName = "Updated Name";
    const updatedBio = "This is an updated bio.";
    const newLastLoginAt = new Date();

    const updatedUser = await prisma.user.update({
      where: { email: userEmail },
      data: {
        name: updatedName,
        bio: updatedBio,
        lastLoginAt: newLastLoginAt,
      },
    });

    expect(updatedUser.name).toBe(updatedName);
    expect(updatedUser.bio).toBe(updatedBio);
    // Date 객체 비교
    expect(updatedUser.lastLoginAt).toEqual(newLastLoginAt);
    expect(updatedUser.email).toBe(initialUser.email); // 이메일은 보통 변경하지 않음 (PK 역할)
  });

  it("should update user passwordHash", async () => {
    const userEmail = `changepw_${Date.now()}@example.com`;
    // const oldPasswordHash = await bcrypt.hash('oldPassword', SALT_ROUNDS);
    const oldPasswordHash = "dummy_old_hashed_password";

    await prisma.user.create({
      data: {
        email: userEmail,
        passwordHash: oldPasswordHash,
      },
    });

    // const newPasswordHash = await bcrypt.hash('newStrongPassword', SALT_ROUNDS);
    const newPasswordHash = "dummy_new_hashed_password";

    const updatedUser = await prisma.user.update({
      where: { email: userEmail },
      data: { passwordHash: newPasswordHash },
    });

    expect(updatedUser.passwordHash).toBe(newPasswordHash);
    // 비밀번호 변경 시 updatedAt 필드도 갱신되어야 합니다.
    expect(updatedUser.updatedAt.getTime()).toBeGreaterThan(
      updatedUser.createdAt.getTime()
    );
  });

  it("should delete a user", async () => {
    const userEmail = `delete_${Date.now()}@example.com`;
    // const passwordHash = await bcrypt.hash('password123', SALT_ROUNDS);
    const passwordHash = "dummy_hashed_password";

    const user = await prisma.user.create({
      data: {
        email: userEmail,
        passwordHash: passwordHash,
      },
    });

    await prisma.user.delete({
      where: { email: userEmail },
    });

    const deletedUser = await prisma.user.findUnique({
      where: { email: userEmail },
    });
    expect(deletedUser).toBeNull();
  });

  it("should create a user with only required fields", async () => {
    const userEmail = `required_${Date.now()}@example.com`;
    // const passwordHash = await bcrypt.hash('password123', SALT_ROUNDS);
    const passwordHash = "dummy_hashed_password";

    const createdUser = await prisma.user.create({
      data: {
        email: userEmail,
        passwordHash: passwordHash,
      },
    });

    expect(createdUser.id).toBeDefined();
    expect(createdUser.email).toBe(userEmail);
    expect(createdUser.passwordHash).toBe(passwordHash);
    expect(createdUser.name).toBeNull();
    expect(createdUser.image).toBeNull();
    expect(createdUser.bio).toBeNull();
  });
});
