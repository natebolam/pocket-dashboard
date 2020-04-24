import PocketBaseService from "./PocketBaseService";
import PocketUserService from "./PocketUserService";
import axios from "axios";

class PocketStripePaymentService extends PocketBaseService {

  constructor() {
    super("api/payments");
  }

  /**
   * Save payment method for use later.
   *
   * @param {string} paymentMethodID Payment method ID to save.
   * @param {object} billingDetails Billing details used on this payment method.
   *
   * @returns {Promise<*>}
   * @private
   */
  __savePaymentMethod(paymentMethodID, billingDetails) {
    const user = PocketUserService.getUserInfo().email;
    const data = {id: paymentMethodID, user, billingDetails};

    return axios.post(this._getURL("payment_method"), data)
      .then(response => response.data);
  }

  /**
   * Mark payment as success on history.
   *
   * @param {string} paymentID Payment intent ID used.
   * @param {string} paymentMethodID Payment method ID to save.
   * @param {object} billingDetails Billing details used on this payment method.
   *
   * @returns {Promise<*>}
   * @private
   */
  async __markPaymentAsSuccess(paymentID, paymentMethodID, billingDetails) {
    const user = PocketUserService.getUserInfo().email;
    const data = {paymentID, user, paymentMethodID, billingDetails};

    return axios.put(this._getURL("history"), data)
      .then(response => response.data);
  }

  /**
   * Confirm payment with new card.
   * If payment is success, the payment method will save for later and mark payment success on history.
   *
   * @param {object} stripe Stripe object.
   * @param {string} paymentIntentSecretID Payment intent to confirm.
   * @param {object} card Card used to confirm payment.
   * @param {{name:string, [address]:{line1:string, [postal_code]:string, country:string}}} billingDetails Billing details about card.
   *
   * @return {Promise<*>}
   * @async
   */
  async confirmPaymentWithNewCard(stripe, paymentIntentSecretID, card, billingDetails) {
    if (!stripe || !card) {
      return false;
    }

    const cardPaymentData = {
      payment_method: {
        card,
        billing_details: billingDetails
      }
    };

    return stripe.confirmCardPayment(paymentIntentSecretID, cardPaymentData)
      .then(result => {
        if (result.paymentIntent) {
          const paymentIntent = result.paymentIntent;

          if (paymentIntent.status.toLowerCase() === "succeeded") {
            this.__savePaymentMethod(paymentIntent.payment_method, billingDetails);
            this.__markPaymentAsSuccess(paymentIntent.id, paymentIntent.payment_method, billingDetails);
          }
        }

        return result;
      });
  }
}

export default new PocketStripePaymentService();