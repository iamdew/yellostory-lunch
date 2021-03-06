import Lunch from '../models/Lunch'
import moment from 'moment'
import { filter, split, join } from 'lodash'

const dateRegex = /^(19|20)\d{2}-(0[1-9]|1[012])-(0[1-9]|[12][0-9]|3[0-1])$/

/**
 * - 우리푸드 : 짝수달 금요일, 월,수 (1,3)
 * - 밥도 : 홀수달 금요일, 화,목 (2,4)
 */
const initializeCategory = (date) => {
    let month = Number(date.format('M'))
    let day = Number(date.day())

    if ([1, 3].includes(day)) {
        return '우리푸드'
    } else if ([2, 4].includes(day)) {
        return '밥도'
    } else if (day === 5) {
        switch (month % 2) {
            case 0: return '우리푸드'
            case 1: return '밥도'
        }
    }
}
const findTodayLunch = async () => {
    let today = moment()
    let category = initializeCategory(today)
    return await Lunch.findLunch(category, today)
}
const findTomorrowLunch = async () => {
    let tomorrow = moment().add(1, 'days')
    let category = initializeCategory(tomorrow)
    return await Lunch.findLunch(category, tomorrow)
}
const findDayAfterTomorrowLunch = async () => {
    let dayAfterTomorrow = moment().add(2, 'days')
    let category = initializeCategory(dayAfterTomorrow)
    return await Lunch.findLunch(category, dayAfterTomorrow)
}
const week = ['일', '월', '화', '수', '목', '금', '토']
const kakaoAPIFormat = (lunch) => {
    if (!lunch) {
        return
    }
    let foods = split(lunch.foods, '\n')
    let date = moment(lunch.date)
    let subject = `${date.format('M월 D일')} (${week[date.format('d')]})` + (lunch.category ? ' / ' + lunch.category : '')
    return subject + '\n\n' + join(filter(foods, (title) => title.trim() != ''), '\n')
}
const kakaoKeyboard = {
    type: 'buttons',
    buttons: ['오늘의 점심 메뉴', '내일 점심은 뭐지?', '모레 점심은 뭐지?'],
}

/**
 * @api {get} /lunch 식단표 목록
 * @apiGroup Lunch
 */
export const get = async (req, res) => {
    let errorMessage
    let { startDate, endDate, category } = req.query

    !errorMessage && startDate && !dateRegex.test(startDate) && (errorMessage = '시작일을 확인해주세요.')
    !errorMessage && endDate && !dateRegex.test(endDate) && (errorMessage = '종료일 확인해주세요.')

    if (errorMessage) {
        return res.status(400).json({
            success: false,
            message: errorMessage,
        });
    }

    let lunches = await Lunch.findAllLunch(category, startDate, endDate)
    res.status(200).json({
        success: true,
        items: lunches,
    })
}

/**
 * @api {get} /lunch/today 오늘의 점심
 * @apiGroup Lunch
 */
export const getTodayLunch = async (req, res) => {
    let lunch = await findTodayLunch()
    res.status(200).json(lunch)
}

/**
 * @api {get} /lunch/tomorrow 내일의 점심
 * @apiGroup Lunch
 */
export const getTomorrowLunch = async (req, res) => {
    let lunch = await findTomorrowLunch()
    res.status(200).json(lunch)
}

/**
 * @api {get} /lunch/day-after-tomorrow 모레의 점심
 * @apiGroup Lunch
 */
export const getDayAfterTomorrowLunch = async (req, res) => {
    let lunch = await findDayAfterTomorrowLunch()
    res.status(200).json(lunch)
}

/**
 * @api {get} /lunch/keyboard 카카오톡 API, KEYBOARD
 * @apiGroup Lunch
 */
export const getKeyboard = async (req, res) => {
    res.json(kakaoKeyboard)
}

/**
 * @api {post} /lunch/message 카카오톡 API, MESSAGE
 * @apiGroup Lunch
 */
export const getMessage = async (req, res) => {
    let content = req.body.content
    let type, lunch, text, message_button
    let today = moment()
    let dayOfWeek
    switch (content) {
        case '오늘의 점심 메뉴': {
            type = '오늘'
            lunch = await findTodayLunch()
            dayOfWeek = Number(today.format('d'))
            break
        }
        case '내일 점심은 뭐지?': {
            type = '내일'
            lunch = await findTomorrowLunch()
            dayOfWeek = Number(today.add(1, 'days').format('d'))
            break
        }
        case '모레 점심은 뭐지?': {
            type = '모레'
            lunch = await findDayAfterTomorrowLunch()
            dayOfWeek = Number(today.add(2, 'days').format('d'))
            break
        }
    }
    lunch && (text = kakaoAPIFormat(lunch))
    if (text) {
        return res.json({
            message: {
                text,
            },
            keyboard: kakaoKeyboard,
        })
    }

    let thisYear = today.format('YYYY')
    let targetYmd = today.format('YYYY-MM-DD')
    let eventDays = req.app.get('event-days')
    if (eventDays[thisYear] && eventDays[thisYear].items[targetYmd]) {
        let item = eventDays[thisYear].items[targetYmd]
        text = type + '은(는) ' + item.name + '이예요~'
    } else if ([0, 6].indexOf(dayOfWeek) !== -1) {
        text = type + '은(는) 기다리던 주말!'
    } else {
        text = '식단표가 없어요!\n식단표 등록에 힘이 되어주세요!'
        message_button = {
            label: '식단표 등록해주기',
            url: 'http://lunch.hyungdew.com',
        }
    }

    res.json({
        message: {
            text,
            message_button,
        },
        keyboard: kakaoKeyboard,
    })
}

/**
 * @api {post} /lunch 점심메뉴 등록/수정
 * @apiGroup Lunch
 */
export const create = async (req, res) => {
    let errorMessage, errorCode
    let { date, category, foods } = req.body

    !errorMessage && !date && (errorMessage = '날짜를 입력해주세요.') && (errorCode = 'date')
    !errorMessage && !dateRegex.test(date) && (errorMessage = '날짜를 확인해주세요.') && (errorCode = 'date')
    !errorMessage && !category && (errorMessage = '카테고리를 입력해주세요.') && (errorCode = 'category')
    !errorMessage && !foods && (errorMessage = '식단표를 입력해주세요.') && (errorCode = 'foods')

    if (errorMessage) {
        return res.status(400).json({
            success: false,
            code: errorCode,
            message: errorMessage,
        })
    }

    let lunch = await Lunch.findLunch(category, date)
    if (lunch) {
        // duplicated, update foods.
        await lunch.updateLunchMenu(foods)
    } else {
        lunch = await Lunch.create({date, category, foods})
    }

    res.json({
        success: true,
        message: 'registered successfully',
        content: lunch,
    })
}


/**
 * @api {delete} /lunch 점심메뉴 삭제
 * @apiGroup Lunch
 */
export const remove = async (req, res) => {
    let errorMessage, errorCode
    let { date, category } = req.query

    !errorMessage && !category && (errorMessage = '카테고리를 입력해주세요.') && (errorCode = 'category')
    !errorMessage && !date && (errorMessage = '날짜를 입력해주세요.') && (errorCode = 'date')
    !errorMessage && !dateRegex.test(date) && (errorMessage = '날짜를 확인해주세요.') && (errorCode = 'date')

    if (errorMessage) {
        return res.status(400).json({
            success: false,
            code: errorCode,
            message: errorMessage,
        })
    }

    let lunch = await Lunch.findLunch(category, date)
    if (lunch) {
        await Lunch.remove(lunch._id)
    }

    res.json({
        success: true,
        message: 'removed successfully',
    })
}
