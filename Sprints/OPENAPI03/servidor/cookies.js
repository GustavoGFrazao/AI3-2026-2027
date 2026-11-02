export function lerCookie(req, nome) {
    const cabecalho = req.get('Cookie');

    if (!cabecalho) {
        return undefined;
    }

    const cookies = cabecalho.split(';');

    for (const cookie of cookies) {
        const separador = cookie.indexOf('=');

        if (separador === -1) {
            continue;
        }

        const chave = cookie.slice(0, separador).trim();
        const valor = cookie.slice(separador + 1).trim();

        if (chave === nome) {
            try {
                return decodeURIComponent(valor);
            } catch {
                return valor;
            }
        }
    }

    return undefined;
}