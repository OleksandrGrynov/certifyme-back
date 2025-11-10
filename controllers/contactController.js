import prisma from "../config/prisma.js"; 


export const createContact = async (req, res) => {
    console.log("📩 Отримано форму з фронта:", req.body);
    try {
        const { name, email, phone, telegram, message, agree } = req.body;

        const contact = await prisma.contact.create({
            data: {
                name,
                email,
                phone,
                telegram,
                message,
                agree: agree || false,
                status: "new", 
            },
        });

        res.status(201).json({ success: true, contact });
    } catch (err) {
        console.error(" Помилка при створенні контакту:", err);
        res.status(500).json({
            success: false,
            message: "Помилка при створенні контакту",
            error: err.message,
        });
    }
};


export const getContacts = async (req, res) => {
    try {
        const { status } = req.query;
        const where = status ? { status } : {};

        const contacts = await prisma.contact.findMany({
            where,
            orderBy: { id: "desc" },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                telegram: true,
                message: true,
                status: true,
                agree: true,
                created_at: true, 
            },
        });

        const formatted = contacts.map((c) => ({
            ...c,
            created_at: c.created_at ? new Date(c.created_at).toISOString() : null,
        }));

        res.json(formatted);
    } catch (err) {
        console.error(" Помилка при отриманні контактів:", err);
        res.status(500).json({
            message: "Не вдалося отримати контакти",
            error: err.message,
        });
    }
};




export const deleteContact = async (req, res) => {
    try {
        const id = Number(req.params.id);
        await prisma.contact.delete({ where: { id } });

        res.json({ success: true, message: "Заявку видалено" });
    } catch (err) {
        console.error(" Помилка видалення заявки:", err);
        res.status(500).json({
            success: false,
            message: "Помилка при видаленні заявки",
            error: err.message,
        });
    }
};


export const updateContactStatus = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { status } = req.body;

        const updated = await prisma.contact.update({
            where: { id },
            data: { status },
        });

        res.json({ success: true, updated });
    } catch (err) {
        console.error(" Помилка оновлення статусу:", err);
        res.status(500).json({
            success: false,
            message: "Помилка при оновленні статусу заявки",
            error: err.message,
        });
    }
};
