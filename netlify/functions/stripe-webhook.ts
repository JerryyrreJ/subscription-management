import Stripe from 'stripe';
import { Handler, HandlerEvent } from '@netlify/functions';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export const handler: Handler = async (event: HandlerEvent) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const sig = event.headers['stripe-signature'];

  if (!sig) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing stripe-signature header' }),
    };
  }

  try {
    // Verify webhook signature
    const stripeEvent = stripe.webhooks.constructEvent(
      event.body!,
      sig,
      webhookSecret
    );

    console.log(`Webhook received: ${stripeEvent.type}`);

    // Handle the event
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object as Stripe.Checkout.Session;

        console.log('Payment successful!', {
          sessionId: session.id,
          customerId: session.customer,
          customerEmail: session.customer_email,
          userId: session.metadata?.userId,
          amountTotal: session.amount_total,
          currency: session.currency,
        });

        // TODO: Here you would typically:
        // 1. Update your database to mark the user as Premium
        // 2. Send confirmation email
        // 3. Update Supabase user profile with premium status

        // For now with Supabase, you could:
        // - Update user_profiles table to set is_premium = true
        // - Store the payment details in a payments table

        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = stripeEvent.data.object as Stripe.PaymentIntent;
        console.log('PaymentIntent successful:', paymentIntent.id);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = stripeEvent.data.object as Stripe.PaymentIntent;
        console.log('PaymentIntent failed:', paymentIntent.id);
        break;
      }

      default:
        console.log(`Unhandled event type: ${stripeEvent.type}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ received: true }),
    };
  } catch (error) {
    console.error('Webhook error:', error);

    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Webhook signature verification failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
