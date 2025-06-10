"use strict";

const translationsUrl = 'https://raw.githubusercontent.com/Muatsuu/CEP_OPERA/refs/heads/main/translateLabels.json';

let translations = {};
let checkInputsInterval = null; // Variável para armazenar o ID do intervalo
let currentAddressInputs = null; // Armazena os inputs de endereço atualmente encontrados
let isListenerAttached = false; // Flag para verificar se o listener já foi anexado

// true para visualizar log no console do navegador
const DEBUGGING_ON_CONSOLE = true;

// Função básica de log
const log = {
    log: function(msg) {
        if (DEBUGGING_ON_CONSOLE) {
            console.log(msg);
        }
    }
};

/**
 * Busca as traduções de rótulos de uma URL.
 * @param {string} url - A URL do arquivo JSON de traduções.
 */
async function fetchTranslations(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Erro na resposta da API ao buscar traduções.');
        }
        translations = await response.json();
        log.log('Traduções carregadas com sucesso!', translations);
    } catch (error) {
        console.error('Erro ao carregar as traduções:', error);
    }
}

// Opções de campos para preenchimento automático: "rua", "bairro", "cidade", "estado", "complemento", "numero"
const fieldsYouWantToAutoFill = ['rua', 'bairro', 'complemento', 'numero'];

/**
 * Normaliza uma string, removendo acentos e caracteres especiais.
 * @param {string} string_text - O texto a ser normalizado.
 * @returns {string} O texto normalizado.
 */
function normalizeString(string_text) {
    return string_text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Consulta a API ViaCEP para obter dados de endereço.
 * @param {string} cep - O CEP a ser consultado.
 * @returns {Promise<object|null>} Um objeto com os dados do endereço ou null se o CEP não for encontrado ou houver erro.
 */
async function consultarCEP(cep) {
    try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();

        if (data.erro) {
            log.log("CEP não encontrado pela ViaCEP.");
            return null;
        }

        const endereco = {
            cep: normalizeString(data.cep),
            estado: normalizeString(data.uf),
            cidade: normalizeString(data.localidade),
            bairro: normalizeString(data.bairro),
            rua: normalizeString(data.logradouro),
            complemento: normalizeString(data.complemento) || null,
        };
        return endereco;
    } catch (error) {
        log.log(`Erro ao consultar CEP: ${error.message}`);
        return null;
    }
}

/**
 * Encontra um campo de input associado a um label com textos específicos.
 * @param {string[]} possibleLabels - Array de textos que o label pode conter.
 * @param {Window} [win=window] - A janela (window ou iframe) onde buscar o elemento.
 * @returns {HTMLInputElement|boolean} O input element associado ao label, ou false se não for encontrado.
 */
function findFieldByLabel(possibleLabels, win = window) {
    for (let labelText of possibleLabels) {
        const resultadoLabel = Array.from(win.document.querySelectorAll('label')).find(el => el.textContent.trim() === labelText);
        if (resultadoLabel) {
            if (resultadoLabel.htmlFor) {
                return win.document.getElementById(resultadoLabel.htmlFor);
            }
        }
    }
    return false;
}

/**
 * Exibe uma mensagem de sucesso flutuante.
 * @param {string} texto - O texto da mensagem.
 * @param {HTMLElement} local - O elemento HTML onde a mensagem será anexada.
 * @param {number} tempo - O tempo em milissegundos que a mensagem ficará visível.
 */
function successMsg(texto, local, tempo) {
    const existingAlert = document.getElementById('cep-opera-alert');
    if (existingAlert) {
        existingAlert.remove();
    }

    const alertElement = document.createElement("div");
    alertElement.id = 'cep-opera-alert';
    alertElement.innerHTML = `<p>${texto}</p>`;
    alertElement.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        padding: 20px;
        background: linear-gradient(120deg, #007BFF, #00D4BF);
        border-radius: 8px;
        border: 1px solid #ccc;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        z-index: 9999999999999;
        font-family: Arial, sans-serif;
        font-size: 16px;
        color: #ffffff;
        display: none;
    `;

    if (local) {
        local.appendChild(alertElement);
    }
    alertElement.style.display = "block";
    setTimeout(() => {
        alertElement.remove(); // Remove o elemento do DOM após o tempo
    }, tempo);
}

/**
 * Retorna um objeto com referências aos inputs do formulário de endereço.
 * Usa as traduções para encontrar os rótulos corretos.
 * @param {Window} [win=window] - A janela (window ou iframe) onde buscar os inputs.
 * @returns {object|null} Um objeto contendo os elementos de input e um método de verificação, ou null se não forem encontrados.
 */
function getFormInputs(win = window) {
    const inputs = {
        cep: findFieldByLabel(translations.cep, win),
        rua: findFieldByLabel(translations.rua, win),
        bairro: findFieldByLabel(translations.bairro, win),
        cidade: findFieldByLabel(translations.cidade, win),
        estado: findFieldByLabel(translations.estado, win),
        complemento: findFieldByLabel(translations.complemento, win),
        numero: findFieldByLabel(translations.numero, win),
        win: win
    };

    if (inputs.cep && inputs.rua && inputs.complemento && inputs.numero) {
        return inputs;
    }
    return null;
}

/**
 * Tenta preencher os campos de endereço com base no CEP inserido.
 * @param {object} inputForm - Objeto contendo os elementos dos inputs do formulário.
 */
async function mayFillAdress(inputForm) {
    const cepValue = inputForm.cep.value.replace(/\D/g, '');

    if (cepValue.length === 8) {
        const correiosData = await consultarCEP(cepValue);
        if (correiosData) {
            log.log(correiosData);
            for (let field of fieldsYouWantToAutoFill) {
                if (field === 'numero') {
                    if (cepValue === '14027250') {
                        inputForm.numero.value = '780';
                        log.log('CEP 14027250 detectado. Número preenchido com 780.');
                    } else {
                        inputForm.numero.value = '';
                        log.log('Outro CEP detectado. Número do endereço em branco.');
                    }
                } else if (correiosData[field] !== undefined) {
                    inputForm[field].value = correiosData[field];
                } else {
                    inputForm[field].value = "";
                }
            }
            successMsg('De nada! ;)', document.body, 1000); // Mensagem por 1 segundo
        }
    }
}

/**
 * Função que tenta encontrar os inputs de endereço e configurar o listener.
 * Será chamada repetidamente pelo setInterval.
 */
function setupAddressListeners() {
    let foundInputs = null;

    // Tenta encontrar inputs na janela principal
    foundInputs = getFormInputs(window);

    // Se não encontrou na janela principal, verifica nos iframes
    if (!foundInputs) {
        for (let i = 0; i < window.frames.length; i++) {
            try {
                const currentFrameInputs = getFormInputs(window.frames[i]);
                if (currentFrameInputs) {
                    foundInputs = currentFrameInputs;
                    log.log('Encontrou os inputs em um iframe.');
                    break;
                }
            } catch (e) {
                log.log(`Não foi possível acessar o iframe ${i}: ${e.message}`);
            }
        }
    }

    // Se novos inputs foram encontrados e são diferentes dos anteriores, ou se é a primeira vez
    if (foundInputs && (currentAddressInputs !== foundInputs || !isListenerAttached)) {
        // Se o listener estava anexado a inputs antigos, remove-o para evitar múltiplos listeners
        if (currentAddressInputs && isListenerAttached && currentAddressInputs.cep) {
            currentAddressInputs.cep.removeEventListener('input', () => mayFillAdress(currentAddressInputs));
            log.log("Listener de CEP antigo removido.");
        }

        currentAddressInputs = foundInputs;
        currentAddressInputs.cep.addEventListener('input', () => mayFillAdress(currentAddressInputs));
        isListenerAttached = true;
        log.log("Listener de CEP adicionado/reatribuído com sucesso.");
    } else if (!foundInputs && isListenerAttached) {
        // Se os inputs não foram encontrados, mas o listener estava ativo, ele pode ter sumido.
        // Reinicia o flag para que um novo listener seja anexado se os inputs reaparecerem.
        if (currentAddressInputs && currentAddressInputs.cep) {
            currentAddressInputs.cep.removeEventListener('input', () => mayFillAdress(currentAddressInputs));
            log.log("Inputs de endereço desapareceram. Listener de CEP removido.");
        }
        currentAddressInputs = null;
        isListenerAttached = false;
    } else if (!foundInputs) {
        log.log('Não localizou os inputs de endereço. Continuando a verificação...');
    }
}

/**
 * Inicializa a extensão: carrega traduções e inicia a verificação dos inputs.
 */
async function initialize() {
    await fetchTranslations(translationsUrl);
    // Inicia a verificação contínua dos inputs a cada 2 segundos
    checkInputsInterval = setInterval(setupAddressListeners, 2000);
    // Tenta configurar os listeners imediatamente na inicialização
    setupAddressListeners();
}

// Inicia a execução da extensão
initialize();
