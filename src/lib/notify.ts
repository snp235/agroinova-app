import prisma from './prisma';

export type NotificationType =
  | 'post_identified'
  | 'event_suggestion_approved'
  | 'event_suggestion_rejected'
  | 'post_reported_action'
  | 'system';

export async function notify(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  linkTo?: string | null;
}) {
  try {
    await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        linkTo: params.linkTo ?? null,
      },
    });
  } catch (err) {
    // Notificação não deve quebrar o fluxo principal — apenas logamos.
    console.error('[notify] failed to create notification', err);
  }
}
