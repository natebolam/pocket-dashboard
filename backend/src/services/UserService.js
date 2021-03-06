import BaseService from "./BaseService";
import {get_auth_providers, getAuthProvider} from "../providers/auth/Index";
import {AuthProviderUser, EmailUser, PocketUser} from "../models/User";
import {AnsweredSecurityQuestion} from "../models/SecurityQuestion";
import BaseAuthProvider from "../providers/auth/BaseAuthProvider";
import {Configurations} from "../_configuration";
import jwt from "jsonwebtoken";
import axios from "axios";
import {DashboardError, DashboardValidationError} from "../models/Exceptions";

const AUTH_TOKEN_TYPE = "access_token";
const USER_COLLECTION_NAME = "Users";

export default class UserService extends BaseService {

  constructor() {
    super();

    /** @type {BaseAuthProvider[]} */
    this.__authProviders = get_auth_providers();
  }

  /**
   * Retrieve User data from Auth provider.
   *
   * @param {string} providerName Name of Auth provider.
   * @param {string} code Code returned by Auth provider.
   *
   * @returns {Promise<AuthProviderUser>} An Auth Provider user.
   * @private
   * @async
   */
  async __getProviderUserData(providerName, code) {
    const authProvider = getAuthProvider(this.__authProviders, providerName);
    const accessToken = await authProvider.getToken(code, AUTH_TOKEN_TYPE);

    return authProvider.getUserData(accessToken, AUTH_TOKEN_TYPE);
  }


  /**
   * Persist user if not exists at Pocket database.
   *
   * @param {PocketUser} user User to create on database.
   *
   * @returns {Promise<boolean>} If user was created or not.
   * @private
   * @async
   */
  async __persistUserIfNotExists(user) {

    if (!await this.userExists(user.email)) {
      /** @type {{result: {n:number, ok: number}}} */
      const result = await this.persistenceService.saveEntity(USER_COLLECTION_NAME, user);

      return result.result.ok === 1;
    }
    return false;
  }

  /**
   * Update last login of user.
   *
   * @param {PocketUser} user User to update last login.
   *
   * @private
   * @async
   */
  async __updateLastLogin(user) {
    const userToUpdate = PocketUser.createPocketUserWithUTCLastLogin(user);

    await this.persistenceService.updateEntity(USER_COLLECTION_NAME, {email: user.email}, userToUpdate);
  }


  /**
   * Get user from DB.
   *
   * @param {string} userEmail User email.
   * @param {string} [provider] Filter by provider.
   *
   * @returns {Promise<*>} User data.
   * @private
   * @async
   */
  async __getUser(userEmail, provider = "email") {
    const filter = {
      email: userEmail,
      provider
    };

    return await this.persistenceService.getEntityByFilter(USER_COLLECTION_NAME, filter);
  }

  /**
   * Check if user exists on DB.
   *
   * @param {string} userEmail User email to check if exists.
   * @param {string} [authProvider] User auth provider type.
   *
   * @returns {Promise<boolean>} If user exists or not.
   * @async
   */
  async userExists(userEmail, authProvider = undefined) {
    let filter = {email: userEmail};

    if (authProvider) {
      filter["provider"] = authProvider;
    }

    const dbUser = await this.persistenceService.getEntityByFilter(USER_COLLECTION_NAME, filter);

    return dbUser !== undefined;
  }

  /**
   * Check if user is validated on DB.
   *
   * @param {string} userEmail User email to check if is validated.
   * @param {string} [authProvider] User auth provider type.
   *
   * @returns {Promise<boolean>} If user is validated or not.
   * @async
   */
  async isUserValidated(userEmail, authProvider = undefined) {
    let filter = {
      email: userEmail,
      securityQuestions: {$ne: null}
    };

    if (authProvider) {
      filter["provider"] = authProvider;
    }

    const dbUser = await this.persistenceService.getEntityByFilter(USER_COLLECTION_NAME, filter);

    return dbUser !== undefined;
  }

  /**
   * Get User from DB.
   *
   * @param {string} email User email.
   *
   * @returns {Promise<PocketUser>} Pocket user.
   * @async
   */
  async getUser(email) {
    const filter = {email};
    const dbUser = await this.persistenceService.getEntityByFilter(USER_COLLECTION_NAME, filter);

    return PocketUser.createPocketUserFromDB(dbUser);
  }

  /**
   * Get customer ID from user.
   *
   * @param {string} userEmail User email.
   *
   * @returns {Promise<string>} The customer ID of user.
   */
  async getUserCustomerID(userEmail) {
    const user = await this.getUser(userEmail);

    return user.customerID;
  }

  /**
   * Save customer ID
   *
   * @param {string} userEmail User email.
   * @param {string} userCustomerID Customer ID.
   *
   * @returns {Promise<boolean>} If was saved or not.
   */
  async saveCustomerID(userEmail, userCustomerID) {
    const filter = {email: userEmail};
    const dbUser = await this.persistenceService.getEntityByFilter(USER_COLLECTION_NAME, filter);

    dbUser.customerID = userCustomerID;

    /** @type {{result: {n:number, ok: number}}} */
    const result = await this.persistenceService.updateEntityByID(USER_COLLECTION_NAME, dbUser._id, dbUser);

    return result.result.ok === 1;
  }

  /**
   * Get consent provider Auth urls.
   *
   * @returns {{name:string, consent_url:string}[]} The consent url for all Auth provider available.
   */
  getConsentProviderUrls() {
    return this.__authProviders.map(provider => {
      return {
        name: provider.name,
        consent_url: provider.getConsentURL()
      };
    });
  }

  /**
   * Authenticate User using an Auth provider. If the user does not exist on our database it will create.
   *
   * @param {string} providerName Name of Auth provider.
   * @param {string} code Code returned by Auth provider.
   *
   * @returns {Promise<PocketUser>} an authenticated(via Auth provider) pocket user.
   * @async
   */
  async authenticateWithAuthProvider(providerName, code) {
    const user = await this.__getProviderUserData(providerName, code);

    // Create the user if not exists on DB.
    await this.__persistUserIfNotExists(user);

    // Update last login of user on DB.
    await this.__updateLastLogin(user);

    return user;
  }

  /**
   * Authenticate user with email or username and password.
   *
   * @param {string} username Email or username of user.
   * @param {string} password Password of user to authenticate.
   *
   * @returns {Promise<PocketUser>} An authenticated pocket user.
   * @throws {DashboardError | DashboardValidationError} If username or password is invalid.
   * @async
   */
  async authenticateUser(username, password) {
    const filter = {$or: [{username}, {email: username}]};
    const userDB = await this.persistenceService.getEntityByFilter(USER_COLLECTION_NAME, filter);

    if (!userDB) {
      throw new DashboardError("Invalid username.");
    }

    const pocketUser = PocketUser.createPocketUserFromDB(userDB);

    if (!pocketUser.password) {
      throw new DashboardValidationError("Passwords do not match.");
    }

    const passwordValidated = await EmailUser.validatePassword(password, pocketUser.password);

    if (!passwordValidated) {
      throw new DashboardValidationError("Passwords do not match.");
    }

    // Update last login of user on DB.
    await this.__updateLastLogin(pocketUser);

    return PocketUser.removeSensitiveFields(pocketUser);
  }

  /**
   * Sign up a User.
   *
   * @param {object} userData User data to validate.
   * @param {string} userData.email Email of userData.
   * @param {string} userData.username Username of userData.
   * @param {string} userData.password1 Password of userData.
   * @param {string} userData.password2 Password to validate against Password1.
   *
   * @returns {Promise<boolean>} If user was created or not.
   * @throws {DashboardError} If validation fails or already exists.
   * @async
   */
  async signupUser(userData) {
    if (EmailUser.validate(userData)) {
      if (await this.userExists(userData.email)) {
        throw new DashboardError("This email is already registered");
      }

      const emailPocketUser = await EmailUser.createEmailUserWithEncryptedPassword(userData.email, userData.username, userData.password1);

      // Create the user if not exists on DB.
      return await this.__persistUserIfNotExists(emailPocketUser);
    }
  }

  /**
   * Logout user.
   *
   * @param {string} email Email of user.
   *
   * @returns {Promise<boolean>} If user was logout or not.
   * @async
   */
  async logout(email) {
    return true;
  }

  /**
   * Add or update answered security questions to user.
   *
   * @param {string} userEmail Email of user.
   * @param {Array<{question: string, answer:string}>} questions Questions to add or update.
   *
   * @returns {Promise<boolean>} If user record was updated or not.
   * @throws {DashboardValidationError} If user is invalid.
   * @async
   */
  async addOrUpdateUserSecurityQuestions(userEmail, questions) {
    const filter = {email: userEmail};
    const userDB = await this.persistenceService.getEntityByFilter(USER_COLLECTION_NAME, filter);

    if (!userDB) {
      throw new DashboardValidationError("Invalid user.");
    }

    const data = {securityQuestions: AnsweredSecurityQuestion.createAnsweredSecurityQuestions(questions)};
    /** @type {{result: {n:number, ok: number}}} */
    const result = await this.persistenceService.updateEntity(USER_COLLECTION_NAME, filter, data);

    return result.result.ok === 1;
  }

  /**
   * Get user security questions.
   *
   * @param {string} userEmail Email of user.
   *
   * @returns {Promise<AnsweredSecurityQuestion[]>} User security questions.
   * @throws {DashboardValidationError} If user is invalid.
   * @async
   */
  async getUserSecurityQuestions(userEmail) {
    const filter = {
      email: userEmail,
      securityQuestions: {$ne: null}
    };
    const userDB = await this.persistenceService.getEntityByFilter(USER_COLLECTION_NAME, filter);

    if (!userDB) {
      throw new DashboardValidationError("Invalid user.");
    }

    return AnsweredSecurityQuestion.createAnsweredSecurityQuestions(userDB.securityQuestions);
  }

  /**
   * Verify user password.
   *
   * @param {string} userEmail User email.
   * @param {string} password Password to verify.
   *
   * @returns {Promise<boolean>} If password was verify or not.
   * @throws {DashboardValidationError} If user is invalid.
   * @async
   */
  async verifyPassword(userEmail, password) {
    const userDB = await this.__getUser(userEmail);

    if (!userDB) {
      throw new DashboardValidationError("Invalid user.");
    }

    return EmailUser.validatePassword(password, userDB.password);
  }

  /**
   * Change user password.
   *
   * @param {string} userEmail Email of user.
   * @param {string} password1 New password.
   * @param {string} password2 Password confirmation.
   *
   * @returns {Promise<boolean>} If password was changed or not.
   * @throws {DashboardValidationError} If passwords validation fails or if user does not exists.
   * @async
   */
  async changePassword(userEmail, password1, password2) {
    const userDB = await this.__getUser(userEmail);

    if (!userDB) {
      throw new DashboardValidationError("Invalid user.");
    }

    if (EmailUser.validatePasswords(password1, password2)) {

      // Update the user password.
      userDB.password = await EmailUser.encryptPassword(password1);

      /** @type {{result: {n:number, ok: number}}} */
      const result = await this.persistenceService.updateEntityByID(USER_COLLECTION_NAME, userDB._id, userDB);

      return result.result.ok === 1;
    }
  }

  /**
   * Change user name.
   *
   * @param {string} userEmail User email.
   * @param {string} username New user name.
   *
   * @returns {Promise<boolean>} If was changed or not.
   * @throws {DashboardValidationError} If validation fails or user does not exists.
   * @async
   */
  async changeUsername(userEmail, username) {
    if (EmailUser.validateUsername(username)) {
      const userDB = await this.__getUser(userEmail);

      if (!userDB) {
        throw new DashboardValidationError("Invalid user.");
      }

      // Update the username.
      userDB.username = username;

      /** @type {{result: {n:number, ok: number}}} */
      const result = await this.persistenceService.updateEntityByID(USER_COLLECTION_NAME, userDB._id, userDB);

      return result.result.ok === 1;
    }
  }

  /**
   * Change user email.
   *
   * @param {string} userEmail Current user email.
   * @param {string} newEmail New user email.
   *
   * @returns {Promise<boolean>} If was changed or not.
   * @throws {DashboardValidationError} If validation fails or user does not exists.
   * @async
   */
  async changeEmail(userEmail, newEmail) {
    if (EmailUser.validateEmail(newEmail)) {
      const userDB = await this.__getUser(userEmail);

      if (!userDB) {
        throw new DashboardValidationError("Invalid user.");
      }

      // Update the user email.
      userDB.email = newEmail;

      /** @type {{result: {n:number, ok: number}}} */
      const result = await this.persistenceService.updateEntityByID(USER_COLLECTION_NAME, userDB._id, userDB);

      return result.result.ok === 1;
    }
  }

  /**
   * Generate token encapsulating the user email.
   *
   * @param {string} userEmail User email to encapsulate.
   *
   * @returns {Promise<string>} The token generated.
   * @async
   */
  async generateToken(userEmail) {
    const payload = {email: userEmail};

    return jwt.sign(payload, Configurations.auth.jwt.secret_key);
  }

  /**
   * Decode a token.
   *
   * @param {string} token Token to decode.
   *
   * @returns {Promise<*>} The token payload.
   * @async
   */
  decodeToken(token) {
    return jwt.verify(token, Configurations.auth.jwt.secret_key);
  }

  /**
   * Validate reCAPTCHA token
   *
   * @param {string} token Token to validate.
   *
   * @returns {Promise<*>} recaptcha result.
   * @async
   */
  async verifyCaptcha(token) {
    const secret = Configurations.recaptcha.google_server;

    /**
     * Although is a POST request, google requires the data to be sent by query
     * params, trying to do so in the body will result on an error.
     */
    return await axios.post(
      `https://www.google.com/recaptcha/api/siteverify?secret=${secret}&response=${token}`
    );
  }
}

