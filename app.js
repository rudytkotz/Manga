const STORAGE_KEY = 'comics-library-v1';
const SUPABASE_URL = window.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';
const form = document.getElementById('comic-form');
const titleInput = document.getElementById('title');
const readInput = document.getElementById('read');
const totalInput = document.getElementById('total');
const feedbackContainer = document.getElementById('form-feedback');
const searchInput = document.getElementById('search');
const statsContainer = document.getElementById('stats');
const comicList = document.getElementById('comic-list');
const filterTabs = document.querySelectorAll('.filter-tab');

let comics = [];
let searchTerm = '';
let activeFilter = 'all';
let editingComicId = null;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function focusTitleEditor(id) {
  requestAnimationFrame(() => {
    const input = document.querySelector(`.title-edit-input[data-id="${id}"]`);
    input?.focus();
    input?.select();
  });
}

function normalizeComic(comic) {
  return {
    ...comic,
    id: comic.id,
    title: comic.title,
    readChapters: comic.readChapters ?? comic.read_chapters ?? 0,
    totalChapters: comic.totalChapters ?? comic.total_chapters ?? null,
    status: comic.status || 'reading',
    rating: comic.rating ?? 0,
  };
}

function saveComics() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(comics));
  void syncComicsToRemote();
}

async function syncComicsToRemote() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

  try {
    const payload = comics.map((comic) => ({
      id: comic.id,
      title: comic.title,
      read_chapters: comic.readChapters,
      total_chapters: comic.totalChapters,
      status: comic.status,
      rating: comic.rating,
    }));

    await fetch(`${SUPABASE_URL}/rest/v1/comics`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn('Falha ao sincronizar com o Supabase:', error);
  }
}

async function loadComics() {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/comics?select=id,title,read_chapters,total_chapters,status,rating`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });

      if (response.ok) {
        const remoteComics = await response.json();
        const normalized = remoteComics.map(normalizeComic);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        return normalized;
      }
    } catch (error) {
      console.warn('Falha ao carregar do Supabase:', error);
    }
  }

  return (JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')).map(normalizeComic);
}

function normalizeText(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function formatTitle(value) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  return trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function getStatusLabel(status) {
  switch (status) {
    case 'want-to-read':
      return 'Quero ler';
    case 'paused':
      return 'Pausado';
    case 'completed':
      return 'Concluído';
    default:
      return 'Lendo';
  }
}

function getStatusClass(status) {
  switch (status) {
    case 'want-to-read':
      return 'want-to-read';
    case 'paused':
      return 'paused';
    case 'completed':
      return 'completed';
    default:
      return '';
  }
}

function showFeedback(message) {
  feedbackContainer.textContent = message;
}

function clearFeedback() {
  feedbackContainer.textContent = '';
}

function findMatchingComic(title, excludeId = null) {
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) return null;

  return comics.find((comic) => {
    if (excludeId && comic.id === excludeId) return false;

    const normalizedComic = normalizeText(comic.title);
    if (!normalizedComic) return false;

    if (normalizedComic === normalizedTitle) return true;
    if (normalizedComic.includes(normalizedTitle) || normalizedTitle.includes(normalizedComic)) return true;

    const comicTokens = normalizedComic.split(' ').filter(Boolean);
    const titleTokens = normalizedTitle.split(' ').filter(Boolean);
    if (!comicTokens.length || !titleTokens.length) return false;

    const overlap = comicTokens.filter((token) => titleTokens.includes(token)).length;
    const similarity = overlap / Math.max(comicTokens.length, titleTokens.length);
    return similarity >= 0.6;
  });
}

function populateFormFromComic(comic) {
  titleInput.value = comic.title;
  readInput.value = comic.readChapters;
  totalInput.value = comic.totalChapters ?? '';
  showFeedback(`Encontramos “${comic.title}” e carregamos o progresso atual.`);
}

function resetForm() {
  form.reset();
  readInput.value = 0;
  totalInput.value = '';
  clearFeedback();
  titleInput.focus();
}

function handleComicStatusChange(id, value) {
  const comic = comics.find((item) => item.id === id);
  if (!comic) return;

  const wasCompleted = comic.status === 'completed';
  comic.status = value;

  if (value === 'completed') {
    comic.totalChapters = comic.readChapters;
  } else if (wasCompleted && value !== 'completed') {
    comic.totalChapters = null;
  }

  saveComics();
  render();
}

window.handleComicStatusChange = handleComicStatusChange;

function renderStats() {
  const total = comics.length;
  const reading = comics.filter((comic) => comic.status === 'reading').length;
  const wantToRead = comics.filter((comic) => comic.status === 'want-to-read').length;
  const paused = comics.filter((comic) => comic.status === 'paused').length;
  const completed = comics.filter((comic) => comic.status === 'completed').length;

  filterTabs.forEach((tab) => {
    const filter = tab.dataset.filter;
    let count = 0;

    switch (filter) {
      case 'reading':
        count = reading;
        break;
      case 'want-to-read':
        count = wantToRead;
        break;
      case 'paused':
        count = paused;
        break;
      case 'completed':
        count = completed;
        break;
      default:
        count = total;
    }

    const baseLabel = {
      all: 'Todos',
      reading: 'Lendo',
      'want-to-read': 'Quero ler',
      paused: 'Pausado',
      completed: 'Concluídos',
    }[filter];

    tab.textContent = `${baseLabel} (${count})`;
  });
}

function renderList() {
  const filtered = comics
    .filter((comic) => {
      const matchesSearch = comic.title.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = activeFilter === 'all' || comic.status === activeFilter;
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));

  if (!filtered.length) {
    comicList.innerHTML = `
      <div class="empty-state">
        Nenhum comic encontrado. Adicione uma obra para começar sua lista.
      </div>
    `;
    return;
  }

  comicList.innerHTML = filtered
    .map((comic) => {
      const hasTotal = comic.totalChapters !== null;
      const progress = hasTotal
        ? Math.min(100, Math.round((comic.readChapters / comic.totalChapters) * 100))
        : 0;
      const statusClass = getStatusClass(comic.status);
      const statusText = getStatusLabel(comic.status);
      const progressLabel = hasTotal ? `${progress}% concluído` : 'Sem total definido';
      const chapterLabel = hasTotal ? `${comic.readChapters} / ${comic.totalChapters} capítulos` : `${comic.readChapters} capítulos lidos`;

      const titleContent = editingComicId === comic.id
        ? `
            <div class="title-editing">
              <input class="title-edit-input" data-id="${comic.id}" value="${escapeHtml(comic.title)}" aria-label="Editar nome do comic" />
              <button class="title-action-btn" data-action="save-name-edit" data-id="${comic.id}" type="button" aria-label="Salvar nome">✓</button>
              <button class="title-action-btn" data-action="cancel-name-edit" data-id="${comic.id}" type="button" aria-label="Cancelar edição">✕</button>
            </div>
          `
        : `
            <div class="title-with-rating">
              <h3 class="comic-title">${escapeHtml(comic.title)}</h3>
              <button class="title-action-btn" data-action="edit-name" data-id="${comic.id}" type="button" aria-label="Editar nome da obra">✎</button>
              <div class="rating-picker" aria-label="Classificar obra">
                ${[1, 2, 3, 4, 5]
                  .map((star) => `
                    <button
                      class="star-btn ${comic.rating >= star ? 'active' : ''}"
                      data-action="rate"
                      data-id="${comic.id}"
                      data-rating="${star}"
                      type="button"
                      aria-label="Avaliar com ${star} estrela${star > 1 ? 's' : ''}"
                    >★</button>
                  `)
                  .join('')}
              </div>
            </div>
          `;

      return `
        <article class="comic-item">
          <div class="comic-top">
            <div>
              ${titleContent}
              <label class="status-picker">
                <select aria-label="Status da obra" data-action="change-status" data-id="${comic.id}" onchange="window.handleComicStatusChange('${comic.id}', this.value)">
                  <option value="reading" ${comic.status === 'reading' ? 'selected' : ''}>Lendo</option>
                  <option value="want-to-read" ${comic.status === 'want-to-read' ? 'selected' : ''}>Quero ler</option>
                  <option value="paused" ${comic.status === 'paused' ? 'selected' : ''}>Pausado</option>
                  <option value="completed" ${comic.status === 'completed' ? 'selected' : ''}>Concluído</option>
                </select>
              </label>
            </div>
            <div class="actions">
              <button class="action-btn" data-action="decrease" data-id="${comic.id}">−</button>
              <button class="action-btn" data-action="increase" data-id="${comic.id}">+</button>
              <button class="action-btn danger" data-action="remove" data-id="${comic.id}" aria-label="Remover obra">×</button>
            </div>
          </div>

          <div class="progress-bar">
            <div class="progress-fill" style="width: ${hasTotal ? progress : 0}%"></div>
          </div>

          <div class="comic-meta">
            <span>${chapterLabel}</span>
            <span>${progressLabel}</span>
          </div>
        </article>
      `;
    })
    .join('');

}

function render() {
  renderStats();
  renderList();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const title = formatTitle(titleInput.value);
  const readChapters = Number.parseInt(readInput.value, 10) || 0;
  const totalValue = totalInput.value.trim();
  const totalChapters = totalValue ? Number.parseInt(totalValue, 10) : null;
  const status = 'reading';
  const rating = 0;

  if (!title) return;

  const sanitizedRead = totalChapters === null ? Math.max(0, readChapters) : Math.max(0, Math.min(readChapters, totalChapters));
  const existingComic = findMatchingComic(title);

  if (existingComic) {
    existingComic.title = title;
    existingComic.readChapters = sanitizedRead;
    existingComic.totalChapters = totalChapters;
    existingComic.status = status;
    saveComics();
    resetForm();
    render();
    showFeedback(`Atualizamos “${title}”.`);
    return;
  }

  comics.unshift({
    id: crypto.randomUUID(),
    title,
    readChapters: sanitizedRead,
    totalChapters,
    status,
    rating,
  });

  saveComics();
  resetForm();
  render();
});

searchInput.addEventListener('input', (event) => {
  searchTerm = event.target.value;
  renderList();
});

filterTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    activeFilter = tab.dataset.filter;
    filterTabs.forEach((item) => item.classList.toggle('active', item === tab));
    renderList();
  });
});

titleInput.addEventListener('blur', () => {
  const title = titleInput.value.trim();
  if (!title) return;

  const matchingComic = findMatchingComic(title);
  if (matchingComic) {
    populateFormFromComic(matchingComic);
  }
});

comicList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const id = button.dataset.id;
  const action = button.dataset.action;
  const comic = comics.find((item) => item.id === id);
  if (!comic) return;

  if (action === 'increase') {
    comic.readChapters = comic.totalChapters === null
      ? comic.readChapters + 1
      : Math.min(comic.readChapters + 1, comic.totalChapters);
  }

  if (action === 'decrease') {
    comic.readChapters = Math.max(comic.readChapters - 1, 0);
  }

  if (action === 'rate') {
    const selectedRating = Number.parseInt(button.dataset.rating, 10) || 0;
    comic.rating = comic.rating === selectedRating ? 0 : selectedRating;
  }

  if (action === 'edit-name') {
    editingComicId = id;
    render();
    focusTitleEditor(id);
    return;
  }

  if (action === 'save-name-edit') {
    const input = comicList.querySelector(`.title-edit-input[data-id="${id}"]`);
    const trimmedTitle = formatTitle(input?.value || '');

    if (!trimmedTitle) {
      showFeedback('O nome não pode ficar vazio.');
      return;
    }

    const duplicateComic = findMatchingComic(trimmedTitle, id);
    if (duplicateComic) {
      showFeedback('Já existe uma obra com esse nome ou um nome muito parecido.');
      return;
    }

    comic.title = trimmedTitle;
    editingComicId = null;
    showFeedback(`Nome atualizado para “${trimmedTitle}”.`);
  }

  if (action === 'cancel-name-edit') {
    editingComicId = null;
    render();
    return;
  }

  if (action === 'remove') {
    comics = comics.filter((item) => item.id !== id);
  }

  saveComics();
  render();
});

comicList.addEventListener('keydown', (event) => {
  if (!event.target.classList.contains('title-edit-input')) return;

  if (event.key === 'Enter') {
    event.preventDefault();
    const id = event.target.dataset.id;
    const saveButton = comicList.querySelector(`button[data-action="save-name-edit"][data-id="${id}"]`);
    saveButton?.click();
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    editingComicId = null;
    render();
  }
});

async function initializeApp() {
  comics = await loadComics();
  render();
}

initializeApp();
