export interface DetailedUploadError {
  title: string;
  stage: string;
  technicalDetail: string;
  causes: string[];
  fixes: string[];
  showCorsJson: boolean;
}

export const R2_CORS_JSON_TEMPLATE = `[
  {
    "AllowedOrigins": [
      "*"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "POST",
      "DELETE",
      "HEAD"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]`;

export function analyzeUploadError(
  err: unknown,
  context?: {
    stage?: string;
    endpoint?: string;
    fileName?: string;
    fileSizeBytes?: number;
  }
): DetailedUploadError {
  const rawMessage =
    err instanceof Error
      ? `${err.name}: ${err.message}`
      : typeof err === 'string'
        ? err
        : JSON.stringify(err || 'Erro desconhecido');

  const lower = rawMessage.toLowerCase();
  const stageLabel = context?.stage || 'Envio de Arquivo (R2 / Banco de Dados)';
  const endpointInfo = context?.endpoint ? ` | Endpoint: ${context.endpoint}` : '';
  const fileInfo = context?.fileName ? ` | Arquivo: ${context.fileName}` : '';

  // 1. "Failed to fetch" / Network / CORS block on R2 PUT or API call
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('load failed') ||
    lower.includes('cors')
  ) {
    return {
      title: 'Falha de Conexão com a Cloudflare R2 ("Failed to fetch")',
      stage: stageLabel,
      technicalDetail: `${rawMessage}${endpointInfo}${fileInfo}`,
      causes: [
        'CAUSA 1 (Mais comum - 90% dos casos): Os buckets "vertice-materials" e "vertice-media" na Cloudflare R2 estão SEM a regra de CORS (CORS Policy). Sem isso, o navegador bloqueia o envio direto do PDF/Imagem e retorna exatamente "Failed to fetch".',
        'CAUSA 2: Na variável R2_ACCOUNT_ID na Vercel, foi colado um link (ex: https://...r2.cloudflarestorage.com) ou espaço em branco em vez de apenas o código de 32 caracteres do ID da conta da Cloudflare.',
        'CAUSA 3: As variáveis R2_* foram salvas na Vercel, mas ainda não foi feito um "Redeploy" na aba Deployments para aplicá-las no ar.',
        'CAUSA 4: Na variável R2_PUBLIC_URL, cada bucket (vertice-materials e vertice-media) possui sua própria URL pública r2.dev (precisa ativar "Public Development URL" nas configurações de cada bucket).',
      ],
      fixes: [
        '1. Abra o painel da Cloudflare -> R2 Object Storage -> clique no bucket "vertice-materials" -> aba "Settings" -> role até "CORS Policy" -> clique em "Add CORS policy" (ou Edit) -> cole o JSON abaixo e salve. Faça o mesmo no bucket "vertice-media".',
        '2. Confira na Vercel (Settings -> Environment Variables) se R2_ACCOUNT_ID contém APENAS o código alfanumérico de 32 caracteres (sem https:// e sem .r2.cloudflarestorage.com).',
        '3. Confira se R2_BUCKET_MATERIALS está escrito exatamente "vertice-materials" e R2_BUCKET_MEDIA está escrito exatamente "vertice-media" (sem espaços no final).',
        '4. Na Vercel, vá em "Deployments" -> clique nos 3 pontinhos (...) do último deploy -> clique em "Redeploy" para que as variáveis entrem em vigor.',
      ],
      showCorsJson: true,
    };
  }

  // 2. SignatureDoesNotMatch / 403 Forbidden on R2
  if (
    lower.includes('403') ||
    lower.includes('signaturedoesnotmatch') ||
    lower.includes('accessdenied') ||
    lower.includes('invalidaccesskeyid')
  ) {
    return {
      title: 'Acesso Negado pela Cloudflare R2 (Erro 403 / Chave ou Permissão)',
      stage: stageLabel,
      technicalDetail: `${rawMessage}${endpointInfo}${fileInfo}`,
      causes: [
        'O Token de API criado na Cloudflare R2 foi criado com permissão "Admin Read" ou "Object Read" em vez de "Object Read & Write" (Leitura e Escrita).',
        'Ou os valores de R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY estão invertidos ou com espaço em branco no início/fim na Vercel.',
      ],
      fixes: [
        '1. Na Cloudflare R2 -> Manage R2 API Tokens -> verifique se o token tem permissão "Object Read & Write" (ou "Admin Read & Write") aplicada a todos os buckets.',
        '2. Verifique na Vercel se R2_ACCESS_KEY_ID tem 32 caracteres e R2_SECRET_ACCESS_KEY tem 64 caracteres.',
        '3. Faça um Redeploy na Vercel após corrigir.',
      ],
      showCorsJson: false,
    };
  }

  // 3. NoSuchBucket / 404 Not Found
  if (lower.includes('404') || lower.includes('nosuchbucket')) {
    return {
      title: 'Bucket R2 Não Encontrado (Erro 404 / NoSuchBucket)',
      stage: stageLabel,
      technicalDetail: `${rawMessage}${endpointInfo}${fileInfo}`,
      causes: [
        'O nome configurado em R2_BUCKET_MATERIALS ou R2_BUCKET_MEDIA na Vercel não bate exatamente com "vertice-materials" ou "vertice-media", ou o R2_ACCOUNT_ID é de outra conta.',
      ],
      fixes: [
        '1. Na Vercel, confirme que R2_BUCKET_MATERIALS = vertice-materials e R2_BUCKET_MEDIA = vertice-media.',
        '2. Confirme que R2_ACCOUNT_ID é o Account ID exibido no canto direito da tela do R2.',
      ],
      showCorsJson: false,
    };
  }

  // 4. Firestore Quota Exceeded (resource-exhausted)
  if (
    lower.includes('resource-exhausted') ||
    lower.includes('quota') ||
    lower.includes('exceeded')
  ) {
    return {
      title: 'Limite Diário do Firebase Firestore Atingido (Quota Exceeded)',
      stage: 'Gravação no Banco de Dados (Firestore)',
      technicalDetail: `${rawMessage}${fileInfo}`,
      causes: [
        'O envio caiu para o banco de dados do Firebase (ou tentou salvar muitos blocos de 650KB no Firestore) e atingiu o limite diário gratuito de 20.000 escritas do Firestore.',
        'Se você está usando a R2 na Vercel, isso indica que o upload para a R2 falhou ou não foi ativado e o app tentou usar o Firestore como reserva.',
      ],
      fixes: [
        '1. Configure o CORS nos buckets "vertice-materials" e "vertice-media" da R2 para que os PDFs subam direto para a Cloudflare R2 (que não consome cota do Firestore).',
        '2. No Firestore, aguarde a renovação diária da cota gratuita ou ative o plano Blaze no Firebase Console.',
      ],
      showCorsJson: true,
    };
  }

  // 5. Firestore Permission Denied
  if (
    lower.includes('permission-denied') ||
    lower.includes('missing or insufficient permissions')
  ) {
    return {
      title: 'Permissão Negada no Banco de Dados (Firestore Rules)',
      stage: 'Gravação no Banco de Dados (Firestore)',
      technicalDetail: `${rawMessage}${fileInfo}`,
      causes: [
        'O usuário logado não está autenticado como administrador ou a sessão do login Google expirou.',
      ],
      fixes: [
        '1. Saia da conta (Sair) e faça login novamente com o e-mail de administrador (luizpaulofisica@gmail.com).',
      ],
      showCorsJson: false,
    };
  }

  // Default fallback with full technical detail
  return {
    title: 'Erro Detalhado ao Enviar Arquivo',
    stage: stageLabel,
    technicalDetail: `${rawMessage}${endpointInfo}${fileInfo}`,
    causes: [
      'A requisição de upload encontrou um erro inesperado durante a comunicação com o armazenamento.',
    ],
    fixes: [
      '1. Verifique o detalhe técnico acima.',
      '2. Se estiver usando Cloudflare R2 na Vercel, adicione a política CORS abaixo nos dois buckets (vertice-materials e vertice-media) e faça Redeploy na Vercel.',
    ],
    showCorsJson: true,
  };
}
