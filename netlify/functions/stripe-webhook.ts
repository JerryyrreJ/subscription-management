import Stripe from 'stripe';
import { Handler, HandlerEvent } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// Initialize Supabase client with service role key for admin operations
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

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

        // Activate Premium status in Supabase
        if (supabase && session.metadata?.userId && session.metadata.userId !== 'guest') {
          try {
            const userId = session.metadata.userId;

            // 1. Record payment in payments table
            const { data: payment, error: paymentError } = await supabase
              .from('payments')
              .insert({
                user_id: userId,
                stripe_session_id: session.id,
                stripe_payment_intent_id: session.payment_intent as string,
                stripe_customer_id: session.customer as string,
                amount_total: session.amount_total || 0,
                currency: session.currency || 'usd',
                status: 'completed',
                product_type: session.metadata.productType || 'premium_lifetime',
                customer_email: session.customer_email,
                metadata: {
                  payment_status: session.payment_status,
                  created_at: session.created,
                },
              })
              .select()
              .single();

            if (paymentError) {
              console.error('Failed to record payment:', paymentError);
            } else {
              console.log('Payment recorded successfully:', payment.id);
            }

            // 2. Update user profile to activate Premium status
            const { data: profile, error: profileError } = await supabase
              .from('user_profiles')
              .update({
                is_premium: true,
                premium_activated_at: new Date().toISOString(),
                premium_payment_id: session.id,
              })
              .eq('id', userId)
              .select()
              .single();

            if (profileError) {
              console.error('Failed to activate Premium:', profileError);
            } else {
              console.log('Premium activated for user:', userId);
            }

            // TODO: Send confirmation email
            // You can integrate with services like SendGrid, AWS SES, or Resend
          } catch (error) {
            console.error('Error processing payment success:', error);
          }
        } else if (session.metadata?.userId === 'guest') {
          console.log('Guest payment - no user account to upgrade');
        } else {
          console.log('Supabase not configured or missing userId metadata');
        }

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
