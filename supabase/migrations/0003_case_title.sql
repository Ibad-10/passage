-- Human-readable case title for lists: "<quantity> × <product name>" from the new case form.
alter table cases add column title text check (title is null or length(title) <= 300);
