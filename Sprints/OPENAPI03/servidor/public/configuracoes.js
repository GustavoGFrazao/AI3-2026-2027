const CONFIGURACOES_POR_OMISSAO = {
    tema: 'claro',
    ordenacao: 'recentes'
};

export function lerConfiguracoes() {
    try {
        const dados = localStorage.getItem('configuracoes');

        if (!dados) {
            return { ...CONFIGURACOES_POR_OMISSAO };
        }

        const configuracoes = JSON.parse(dados);

        if (
            !configuracoes ||
            !['claro', 'escuro'].includes(configuracoes.tema) ||
            !['recentes', 'estado'].includes(configuracoes.ordenacao)
        ) {
            return { ...CONFIGURACOES_POR_OMISSAO };
        }

        return configuracoes;
    } catch {
        return { ...CONFIGURACOES_POR_OMISSAO };
    }
}

export function guardarConfiguracoes(configuracoes) {
    localStorage.setItem(
        'configuracoes',
        JSON.stringify(configuracoes)
    );
}