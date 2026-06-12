import { faker } from "@faker-js/faker";

export interface UserData {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  password: string;
  phone: string;
  avatar: string;
}

export interface FormData {
  name: string;
  email: string;
  password: string;
  gender: string;
  dateOfBirth: string;
  message: string;
}

export interface AddressData {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface CreditCardData {
  number: string;
  holder: string;
  expiry: string;
  cvv: string;
}

/** Generate random user data */
export function generateUserData(): UserData {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();

  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    email: faker.internet.email({ firstName, lastName }),
    password: faker.internet.password({ length: 12, memorable: false }),
    phone: faker.phone.number(),
    avatar: faker.image.avatar(),
  };
}

/** Generate random form data */
export function generateFormData(): FormData {
  return {
    name: faker.person.fullName(),
    email: faker.internet.email(),
    password: faker.internet.password({ length: 12 }),
    gender: faker.helpers.arrayElement(["Male", "Female"]),
    dateOfBirth: faker.date
      .birthdate({ min: 18, max: 65, mode: "age" })
      .toISOString()
      .split("T")[0]!,
    message: faker.lorem.paragraph(),
  };
}

/** Generate random address data */
export function generateAddress(): AddressData {
  return {
    street: faker.location.streetAddress(),
    city: faker.location.city(),
    state: faker.location.state(),
    zipCode: faker.location.zipCode(),
    country: faker.location.country(),
  };
}

/** Generate random credit card data */
export function generateCreditCard(): CreditCardData {
  return {
    number: faker.finance.creditCardNumber(),
    holder: faker.person.fullName(),
    expiry: `${faker.number.int({ min: 1, max: 12 }).toString().padStart(2, "0")}/${faker.number.int({ min: 25, max: 30 })}`,
    cvv: faker.finance.creditCardCVV(),
  };
}
