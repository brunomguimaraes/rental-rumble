const assetBase = '/sprites/world/hearth-town-v2/';
const map = document.querySelector('#hotspots');
const list = document.querySelector('#destinations');
const details = document.querySelector('#place-details');
const visibility = document.querySelector('#show-hotspots');

function paragraph(text, className) {
  const element = document.createElement('p');
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function selectPlace(place) {
  document.querySelectorAll('[data-place-id]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.placeId === place.id));
  });
  const title = document.createElement('h3');
  title.textContent = place.label;
  const ideas = document.createElement('ul');
  place.interactionIdeas.forEach((idea) => {
    const item = document.createElement('li');
    item.textContent = idea;
    ideas.append(item);
  });
  details.replaceChildren(
    paragraph(`${place.number} / ${place.kind.toUpperCase().replaceAll('-', ' ')}`, 'eyebrow'),
    title,
    paragraph(place.description),
    paragraph(place.role, 'role'),
    paragraph('PROPOSED INTERACTIONS', 'eyebrow'),
    ideas,
  );
}

async function showTown() {
  const response = await fetch(`${assetBase}hotspots.json`);
  if (!response.ok) throw new Error(`Asset layout returned HTTP ${response.status}.`);
  const layout = await response.json();
  const { width, height } = layout.coordinateSystem;
  layout.hotspots.forEach((place) => {
    const hit = document.createElement('button');
    const { x, y, width: hitWidth, height: hitHeight } = place.bounds;
    hit.type = 'button';
    hit.className = 'hotspot';
    hit.dataset.placeId = place.id;
    hit.setAttribute('aria-label', place.label);
    hit.setAttribute('aria-pressed', 'false');
    hit.style.left = `${x / width * 100}%`;
    hit.style.top = `${y / height * 100}%`;
    hit.style.width = `${hitWidth / width * 100}%`;
    hit.style.height = `${hitHeight / height * 100}%`;
    const badge = document.createElement('span');
    badge.textContent = place.number;
    badge.setAttribute('aria-hidden', 'true');
    badge.style.left = `${(place.anchor.x - x) / hitWidth * 100}%`;
    badge.style.top = `${(place.anchor.y - y) / hitHeight * 100}%`;
    hit.append(badge);
    hit.addEventListener('click', () => selectPlace(place));
    map.append(hit);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'destination';
    button.dataset.placeId = place.id;
    button.setAttribute('aria-pressed', 'false');
    const number = document.createElement('span');
    number.className = 'number';
    number.textContent = place.number;
    number.setAttribute('aria-hidden', 'true');
    button.append(number, document.createTextNode(place.label));
    button.addEventListener('click', () => selectPlace(place));
    list.append(button);
  });
  selectPlace(layout.hotspots[0]);
}

visibility.addEventListener('change', () => { map.hidden = !visibility.checked; });
showTown().catch((error) => {
  details.replaceChildren(paragraph('The town layout could not load. Open this preview through the local Vite server, then reload.'));
  document.querySelector('#status').textContent = error.message;
});
