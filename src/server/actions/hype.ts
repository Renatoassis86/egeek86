'use server';

import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { createHash } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dropWaitlist, dropAccessLog } from '@/db/schema';
import { getCurrentProfile } from '@/lib/auth/require-admin';

/**
 * Entrar na lista de espera de um drop específico.
 */
export async function joinDropWaitlist(dropId: string) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { error: 'Você precisa estar logado para entrar na lista de espera.' };
    }

    // Verificar se já está cadastrado
    const [existing] = await db
      .select()
      .from(dropWaitlist)
      .where(and(eq(dropWaitlist.dropId, dropId), eq(dropWaitlist.userId, profile.id)))
      .limit(1);

    if (existing) {
      return { success: true, message: 'Você já está na lista de espera deste drop.' };
    }

    await db.insert(dropWaitlist).values({
      dropId,
      userId: profile.id,
      notifyChannels: ['email', 'telegram'],
    });

    // Registra a telemetria
    await logDropAccessInternal({
      dropId,
      userId: profile.id,
      action: 'queue',
      metadata: { source: 'waitlist_join' }
    });

    revalidatePath('/hype-zone');
    return { success: true, message: 'Inscrição realizada com sucesso! Avisaremos quando o drop iniciar.' };
  } catch (error) {
    console.error('Erro ao entrar na lista de espera:', error);
    return { error: 'Ocorreu um erro ao processar sua inscrição. Tente novamente mais tarde.' };
  }
}

/**
 * Server Action pública para registrar telemetria de visualização e ações no drop.
 * Utilizado para forensics e análise anti-bot em tempo real.
 */
export async function logDropAccess(dropId: string, action: 'view' | 'reserve' | 'convert' | 'fail', clientMetadata: any = {}) {
  try {
    const profile = await getCurrentProfile();
    await logDropAccessInternal({
      dropId,
      userId: profile?.id ?? null,
      action,
      metadata: clientMetadata
    });
    return { success: true };
  } catch (error) {
    console.error('Erro ao registrar log de acesso do drop:', error);
    return { error: 'Falha ao registrar telemetria.' };
  }
}

/**
 * Grava o log de acesso com hashing de IP e fingerprinting básico.
 */
async function logDropAccessInternal({
  dropId,
  userId,
  action,
  metadata
}: {
  dropId: string;
  userId: string | null;
  action: string;
  metadata?: any;
}) {
  try {
    const headerList = await headers();
    const rawIp = headerList.get('x-forwarded-for') || headerList.get('x-real-ip') || '127.0.0.1';
    
    // Hash do IP para conformidade com LGPD/GDPR
    const ipHash = createHash('sha256').update(rawIp).digest('hex').slice(0, 32);
    const userAgent = headerList.get('user-agent') || 'unknown';

    await db.insert(dropAccessLog).values({
      dropId,
      userId,
      ipHash,
      fingerprint: userAgent,
      action,
      metadata: {
        ...metadata,
        timestamp: Date.now()
      }
    });
  } catch (err) {
    console.error('Falha ao gravar log de acesso interno:', err);
  }
}
