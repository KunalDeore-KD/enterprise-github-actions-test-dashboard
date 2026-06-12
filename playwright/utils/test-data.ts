import { faker } from "@faker-js/faker";

// Type definition for the form data (reusable across tests)
export interface PracticeFormData {
  name: string;
  email: string;
  password: string;
  gender: string;
  dob: string;
  loveIceCream: boolean;
  employment: "student" | "employed";
}

// Generates a complete set of random form data for the AngularPractice page
export function generatePracticeFormData(): PracticeFormData {
  return {
    name: faker.person.fullName(),
    email: faker.internet.email(),
    password: faker.internet.password({ length: 12 }),
    gender: faker.helpers.arrayElement(["Male", "Female"]),
    dob:
      faker.date.birthdate({ min: 18, max: 65, mode: "age" })?.toISOString().split("T")[0] ??
      "1970-01-01",
    loveIceCream: faker.datatype.boolean(),
    employment: faker.helpers.arrayElement(["student", "employed"] as const),
  };
}

// Generates just a random name (useful for quick single-field tests)
export function generateRandomName(): string {
  return faker.person.fullName();
}

// Generates just a random email (useful for quick single-field tests)
export function generateRandomEmail(): string {
  return faker.internet.email();
}

// Generates a random password with specified length
export function generateRandomPassword(length: number = 12): string {
  return faker.internet.password({ length });
}
