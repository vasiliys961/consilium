import {nativePrivacyGuard} from '@/lib/concilium-privacy';
import { NextRequest, NextResponse } from 'next/server';
import {
  buildDrugInteractions,
  resolveDrugInteractionDetectorModel,
  resolveDrugInteractionExplainerModel,
  type DrugInteractionResult,
} from '@/lib/drug-interactions';
import { runWithLlmProvider } from '@/lib/llm-provider';

export async function POST(request: NextRequest) {
  const privacyError=await nativePrivacyGuard(request);if(privacyError)return privacyError;
  const body = await request.json();
  return runWithLlmProvider(body?.provider, async () => {
  try {
    const protocol = String(body?.protocol ?? '').trim();

    if (!protocol) {
      return NextResponse.json(
        { success: false, error: 'Текст протокола не передан.' },
        { status: 400 }
      );
    }

    const interactions: DrugInteractionResult[] = await buildDrugInteractions(protocol);
    return NextResponse.json({
      success: true,
      interactions,
      detectorModel: resolveDrugInteractionDetectorModel(),
      explainerModel: resolveDrugInteractionExplainerModel(),
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Не удалось проверить взаимодействия.' },
      { status: 500 }
    );
  }
  });
}
