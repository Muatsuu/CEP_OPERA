"use strict";

// URL para buscar as traduções dos rótulos.
const TRANSLATIONS_URL = 'https://raw.githubusercontent.com/Muatsuu/CEP_OPERA/refs/heads/main/translateLabels.json';

// Armazena as traduções carregadas. Inicializado como null.
let translations = null;

// Controla a exibição de logs no console do navegador.
const DEBUGGING_ON_CONSOLE = true;

/**
 * Objeto para funções de log.
 * Controla a exibição de mensagens no console com base na constante DEBUGGING_ON_CONSOLE.
 */
const log = {
    /**
     * Exibe uma mensagem no console se o debugging estiver ativado.
     * @param {...any} msg - A(s) mensagem(ns) a ser(em) logada(s).
     */
    log: function(...msg) {
        if (DEBUGGING_ON_CONSOLE) {
            console.log(...msg);
        }
    },
    /**
     * Exibe uma mensagem de erro no console se o debugging estiver ativado.
     * @param {...any} msg - A(s) mensagem(ns) de erro a ser(em) logada(s).
     */
    error: function(...msg) {
        if (DEBUGGING_ON_CONSOLE) {
            console.error(...msg);
        }
    },
    /**
     * Exibe uma mensagem de aviso no console se o debugging estiver ativado.
     * @param {...any} msg - A(s) mensagem(ns) de aviso a ser(em) logada(s).
     */
    warn: function(...msg) {
        if (DEBUGGING_ON_CONSOLE) {
            console.warn(...msg);
        }
    }
};

/**
 * Busca as traduções de rótulos de uma URL.
 * @param {string} url - A URL do arquivo JSON de traduções.
 * @returns {Promise<void>} Uma promessa que resolve quando as traduções são carregadas.
 */
async function fetchTranslations(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Erro na resposta da API ao buscar traduções: ${response.status} ${response.statusText}`);
        }
        translations = await response.json();
        log.log('Traduções carregadas com sucesso!', translations);
    } catch (error) {
        log.error('Erro ao carregar as traduções:', error);
        // Opcional: Tratar o erro de forma mais robusta, como exibir uma mensagem para o usuário.
    }
}

/**
 * Opções de campos para preenchimento automático.
 * Sempre em lowerCase().
 * Adicionado 'numero' para ser considerado no preenchimento.
 */
const fieldsToAutoFill = ['rua', 'bairro', 'complemento', 'numero', 'cep', 'estado', 'cidade']; // Adicionados cep, estado, cidade para consistência

/**
 * Normaliza uma string, removendo acentos e caracteres especiais.
 * @param {string} string_text - O texto a ser normalizado.
 * @returns {string} O texto normalizado.
 */
function normalizeString(string_text) {
    if (typeof string_text !== 'string') {
        log.warn('normalizeString recebeu um valor não-string:', string_text);
        return ''; // Retorna string vazia ou lança um erro, dependendo do comportamento desejado
    }
    return string_text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Consulta a API ViaCEP para obter dados de endereço.
 * @param {string} cep - O CEP a ser consultado (apenas dígitos).
 * @returns {Promise<object|null>} Um objeto com os dados do endereço ou null se o CEP não for encontrado ou houver erro.
 */
async function consultarCEP(cep) {
    const cleanedCep = cep ? cep.replace(/\D/g, '') : ''; // Remove caracteres não numéricos
    if (!cleanedCep || cleanedCep.length !== 8) {
        log.log("CEP inválido. Deve conter 8 dígitos numéricos.");
        return null;
    }
    try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanedCep}/json/`);
        if (!response.ok) {
            throw new Error(`Erro na resposta da API ViaCEP: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();

        if (data.erro) {
            log.log("CEP não encontrado pela ViaCEP.");
            return null;
        }

        return {
            cep: normalizeString(data.cep),
            estado: normalizeString(data.uf),
            cidade: normalizeString(data.localidade),
            bairro: normalizeString(data.bairro),
            rua: normalizeString(data.logradouro),
            complemento: normalizeString(data.complemento || '') || null, // Garante que é string antes de normalizar
        };
    } catch (error) {
        log.error(`Erro ao consultar CEP ${cleanedCep}:`, error);
        return null;
    }
}

/**
 * Busca um elemento no DOM pelo seletor e por um trecho do seu ID.
 * OBS: Esta função é mantida por segurança caso seja relevante para outros elementos,
 * mas `findFieldByLabel` é preferível para campos de formulário associados a labels.
 * @param {string} selector - O seletor CSS (ex: 'span', 'input').
 * @param {string[]} possibleText - Array de trechos de texto que o ID do elemento pode conter.
 * @param {Window} [win=window] - A janela (window ou iframe) onde buscar o elemento.
 * @returns {HTMLElement|null} O elemento encontrado ou null se não for encontrado.
 */
function querySelectorByIdIncludesText(selector, possibleText, win = window) {
    if (!Array.isArray(possibleText) || possibleText.length === 0) {
        log.warn('querySelectorByIdIncludesText: possibleText deve ser um array não vazio.');
        return null;
    }
    for (const text of possibleText) {
        // Usa `document.querySelector` com um seletor de atributo `[id*="text"]` para melhor performance e concisão.
        const element = win.document.querySelector(`${selector}[id*="${text}"]`);
        if (element) {
            return element;
        }
    }
    return null;
}

/**
 * Encontra um campo de input associado a um label com textos específicos.
 * Prioriza 'htmlFor' para associações explícitas.
 * @param {string[]} possibleLabels - Array de textos que o label pode conter (traduções).
 * @param {Window} [win=window] - A janela (window ou iframe) onde buscar o elemento.
 * @returns {HTMLInputElement|null} O input element associado ao label, ou null se não for encontrado.
 */
function findFieldByLabel(possibleLabels, win = window) {
    if (!possibleLabels || !Array.isArray(possibleLabels) || possibleLabels.length === 0) {
        log.warn('findFieldByLabel: possibleLabels deve ser um array não vazio.');
        return null;
    }

    const allLabels = Array.from(win.document.querySelectorAll('label'));

    for (const labelText of possibleLabels) {
        const normalizedLabelText = normalizeString(labelText);
        const label = allLabels.find(el => normalizeString(el.textContent.trim()) === normalizedLabelText);

        if (label) {
            // 1. Prioriza 'htmlFor'
            if (label.htmlFor) {
                const inputElement = win.document.getElementById(label.htmlFor);
                if (inputElement instanceof HTMLInputElement) {
                    return inputElement;
                }
            }

            // 2. Tenta encontrar um input aninhado
            const nestedInput = label.querySelector('input');
            if (nestedInput instanceof HTMLInputElement) {
                return nestedInput;
            }

            // 3. Tenta encontrar um input adjacente
            let nextSibling = label.nextElementSibling;
            while (nextSibling) {
                if (nextSibling instanceof HTMLInputElement) {
                    return nextSibling;
                }
                nextSibling = nextSibling.nextElementSibling;
            }
        }
    }
    return null;
}

/**
 * Exibe uma mensagem de sucesso flutuante.
 * @param {string} texto - O texto da mensagem.
 * @param {HTMLElement} [local=document.body] - O elemento HTML onde a mensagem será anexada. Padrão para document.body.
 * @param {number} [tempo=3000] - O tempo em milissegundos que a mensagem ficará visível. Padrão para 3000ms.
 */
function successMsg(texto, local = document.body, tempo = 3000) {
    const alertElement = document.createElement("div");
    alertElement.innerHTML = `<p>${texto}</p>`;
    Object.assign(alertElement.style, {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        padding: "20px",
        background: "linear-gradient(120deg, #007BFF, #00D4BF)",
        borderRadius: "8px",
        border: "1px solid #ccc",
        boxShadow: "0 4px 8px rgba(0, 0, 0, 0.2)",
        zIndex: "9999999999999",
        fontFamily: "Arial, sans-serif",
        fontSize: "16px",
        color: "#ffffff",
        display: "none", // Inicia oculto
        textAlign: "center",
        // Adicionando transições para um efeito mais suave
        opacity: "0",
        transition: "opacity 0.5s ease-in-out"
    });

    if (local && local.appendChild) {
        local.appendChild(alertElement);
    } else {
        log.error("Elemento 'local' inválido para anexar a mensagem de sucesso.", local);
        return;
    }

    // Exibe com opacidade para transição
    setTimeout(() => {
        alertElement.style.display = "block";
        alertElement.style.opacity = "1";
    }, 10); // Pequeno delay para garantir que o display:block seja aplicado antes da transição de opacidade

    setTimeout(() => {
        alertElement.style.opacity = "0"; // Inicia a transição de saída
        alertElement.addEventListener('transitionend', () => {
            alertElement.remove(); // Remove o elemento após a transição
        }, { once: true }); // Garante que o evento é removido após a primeira execução
    }, tempo);
}

/**
 * Retorna um objeto com referências aos inputs do formulário de endereço.
 * Usa as traduções para encontrar os rótulos corretos.
 * @param {Window} [win=window] - A janela (window ou iframe) onde buscar os inputs.
 * @returns {object} Um objeto contendo os elementos de input e um método de verificação.
 */
const getFormInputs = function(win = window) {
    if (!translations) {
        log.warn("Traduções não carregadas ainda. Não é possível obter os inputs do formulário.");
        return { wereFound: false, cepInput: null, streetInput: null, neighborhoodInput: null, cityInput: null, stateInput: null, complementInput: null, numberInput: null };
    }

    const inputs = {
        cepInput: findFieldByLabel(translations.cep, win),
        streetInput: findFieldByLabel(translations.street, win),
        neighborhoodInput: findFieldByLabel(translations.neighborhood, win),
        cityInput: findFieldByLabel(translations.city, win),
        stateInput: findFieldByLabel(translations.state, win),
        complementInput: findFieldByLabel(translations.complement, win),
        numberInput: findFieldByLabel(translations.number, win)
    };

    const wereFound = Object.values(inputs).every(input => input !== null); // Verifica se todos os inputs foram encontrados
    inputs.wereFound = wereFound;

    if (!wereFound) {
        log.warn("Nem todos os inputs do formulário foram encontrados:", inputs);
    } else {
        log.log("Todos os inputs do formulário foram encontrados com sucesso.");
    }

    return inputs;
};

// Auto-execução da função de busca de traduções ao carregar o script.
// É importante que as traduções estejam disponíveis antes de tentar encontrar os campos.
fetchTranslations(TRANSLATIONS_URL);

// Adicionar um ouvinte para o evento 'DOMContentLoaded' para garantir que o DOM esteja totalmente carregado
// antes de tentar manipular elementos.
document.addEventListener('DOMContentLoaded', async () => {
    // Aguarda o carregamento das traduções antes de tentar obter os inputs
    if (!translations) {
        await fetchTranslations(TRANSLATIONS_URL);
    }

    const { cepInput, streetInput, neighborhoodInput, cityInput, stateInput, complementInput, numberInput, wereFound } = getFormInputs();

    if (wereFound && cepInput) {
        log.log("Campo de CEP encontrado. Adicionando ouvinte de evento.");
        cepInput.addEventListener('blur', async () => {
            const cep = cepInput.value.replace(/\D/g, ''); // Remove caracteres não numéricos
            if (cep.length === 8) {
                log.log(`Consultando CEP: ${cep}`);
                const addressData = await consultarCEP(cep);

                if (addressData) {
                    log.log("Dados do endereço obtidos:", addressData);

                    if (streetInput) streetInput.value = addressData.rua || '';
                    if (neighborhoodInput) neighborhoodInput.value = addressData.bairro || '';
                    if (cityInput) cityInput.value = addressData.cidade || '';
                    if (stateInput) stateInput.value = addressData.estado || '';
                    if (complementInput) complementInput.value = addressData.complemento || '';

                    // Adiciona foco ao campo de número se ele existir e for preenchível
                    if (numberInput) {
                        numberInput.focus();
                        successMsg("Endereço preenchido com sucesso! Favor, preencher o número.", document.body);
                    } else {
                        successMsg("Endereço preenchido com sucesso!", document.body);
                    }
                } else {
                    successMsg("CEP não encontrado ou inválido.", document.body);
                }
            } else {
                log.log("CEP com menos de 8 dígitos após blur. Nenhuma consulta será feita.");
            }
        });
    } else {
        log.warn("Campo de CEP não encontrado ou nem todos os inputs foram localizados. O preenchimento automático pode não funcionar.");
    }
});
