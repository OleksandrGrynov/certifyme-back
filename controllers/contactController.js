import { addContact, getAllContacts } from "../models/ContactModel.js";

export const createContact = async (req, res) => {
    console.log("📩 Отримано форму з фронта:", req.body);

    try {
        const contact = await addContact(req.body);
        res.status(201).json(contact);
    } catch (err) {
        console.error("❌ Помилка при створенні контакту:", err);
        res.status(500).json({ message: "Помилка при створенні контакту", error: err.message });
    }
};


export const getContacts = async (req, res) => {
    try {
        const contacts = await getAllContacts();
        res.json(contacts);
    } catch (err) {
        res.status(500).json({ message: "Не вдалося отримати контакти", error: err.message });
    }
};
